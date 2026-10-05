import fs from 'node:fs';
import {writeDurableJSON} from './durable-json.mjs';
import {assertRuntimeSafe} from './safe-authority.mjs';
import {assertAllowedSafeCall,verifySafeProposal} from './safe-operation.mjs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { JsonRpcProvider, Contract, ContractFactory, Interface, NonceManager,
  ZeroAddress, ZeroHash, concat, keccak256, toUtf8Bytes, parseEther } from 'ethers';
import { ROOT, compile, artifact } from './compile.mjs';

export const RPC = 'https://sepolia.base.org';
export const CHAIN_ID = 31337;
export const NETWORK=process.env.AIM_DEMO_NETWORK||'local-fork';
if(!['local-fork','bsc-testnet','base-sepolia'].includes(NETWORK))throw new Error('Unknown demo network; mainnet is forbidden');
export const RUNTIME = path.join(ROOT,NETWORK==='base-sepolia'?'runtime-base':NETWORK==='bsc-testnet'?'runtime-bsc':'runtime');
export const json = value => JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v,2);
export function save(name,value) {
  fs.mkdirSync(RUNTIME,{recursive:true,mode:0o700});
  writeDurableJSON(path.join(RUNTIME,name),json(value));
}
export function load(name,fallback=null) {
  const p=path.join(RUNTIME,name); return fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):fallback;
}
export const hash = data => keccak256(typeof data==='string'?toUtf8Bytes(data):data);

export function bosonABI() {
  const dir=path.join(ROOT,'node_modules/@bosonprotocol/common/src/abis');
  const names=['IBosonAccountHandler','IBosonOfferHandler','IBosonExchangeHandler','IBosonExchangeCommitHandler','IBosonDisputeHandler','IBosonFundsHandler','IBosonConfigHandler','BosonErrors'];
  const result=[], seen=new Set();
  for(const name of names) {
    const file=path.join(dir,name+'.json'); if(!fs.existsSync(file)) continue;
    for(const item of JSON.parse(fs.readFileSync(file,'utf8'))) {
      const key=JSON.stringify(item); if(!seen.has(key)) {seen.add(key);result.push(item);}
    }
  }
  return result;
}

export async function startChain(wallets) {
  if(NETWORK!=='local-fork')throw new Error('Local fork cannot serve the BSC testnet profile');
  const addresses=JSON.parse(fs.readFileSync(path.join(ROOT,'node_modules/@bosonprotocol/common/src/generated/protocolAddresses.json'),'utf8'));
  const diamond=addresses.testing['84532'].protocolDiamond;
  let manifest=load('manifest.json');
  if(!manifest) {
    const remote=new JsonRpcProvider(RPC,84532,{staticNetwork:true});
    if(Number(await remote.send('eth_chainId',[]))!==84532) throw new Error('Unexpected public chain');
    const block=await remote.getBlock('latest');
    const code=await remote.getCode(diamond,block.number);
    if(code==='0x') throw new Error('Official Boson testnet deployment has no code');
    manifest={schemaVersion:1,mode:'local-base-sepolia-fork',chainId:CHAIN_ID,sourceChainId:84532,
      sourceRPC:RPC,forkBlock:block.number,forkBlockHash:block.hash,sourceBoson:diamond,
      sourceBosonCodeHash:keccak256(code),createdAt:new Date().toISOString(),publicTransactions:false};
    save('manifest.json',manifest); remote.destroy();
  }
  if(manifest.chainId!==CHAIN_ID || manifest.sourceBoson.toLowerCase()!==diamond.toLowerCase())
    throw new Error('Chain manifest mismatch');
  const platform=process.platform==='win32'?'win32':process.platform;
  const arch=process.arch==='x64'?'amd64':'arm64';
  const binary=path.join(ROOT,'node_modules',`@foundry-rs/anvil-${platform}-${arch}`,'bin',process.platform==='win32'?'anvil.exe':'anvil');
  if(!fs.existsSync(binary))throw new Error('Anvil platform binary is missing; run npm install');
  const rpcPort=Number(process.env.AIM_DEMO_RPC_PORT||19545);
  const localRPC=`http://127.0.0.1:${rpcPort}`;
  const log=fs.openSync(path.join(RUNTIME,'anvil.log'),'a',0o600);
  const child=spawn(binary,['--host','127.0.0.1','--port',String(rpcPort),'--accounts','0','--silent',
    '--chain-id',String(CHAIN_ID),'--hardfork','cancun','--fork-url',RPC,'--fork-block-number',String(manifest.forkBlock),
    '--fork-chain-id','84532','--timeout','10000','--retries','1','--no-cors',
    '--state',path.join(RUNTIME,'anvil-state.json'),'--state-interval','1'],{stdio:['ignore',log,log]});
  const provider=new JsonRpcProvider(localRPC,CHAIN_ID,{staticNetwork:true,cacheTimeout:-1,batchMaxCount:1});
  let ready=false;
  for(let attempt=0;attempt<300;attempt++) {
    if(child.exitCode!==null)throw new Error('Anvil exited; inspect runtime/anvil.log');
    try{ready=Number(await provider.send('eth_chainId',[]))===CHAIN_ID;if(ready)break;}catch{}
    await delay(200);
  }
  if(!ready){child.kill('SIGTERM');throw new Error('Anvil startup timed out');}
  const evm={disconnect:async()=>{
    await provider.send('anvil_dumpState',[]).then(data=>fs.writeFileSync(path.join(RUNTIME,'latest-state.hex'),data,{mode:0o600}));
    provider.destroy();
    await new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM');});fs.closeSync(log);
  }};
  for(const wallet of Object.values(wallets)) {
    // Prefunding is local-only; no faucet credit or public balance is claimed.
    if(await provider.getBalance(wallet.address)<parseEther('10'))
      await provider.send('anvil_setBalance',[wallet.address,'0x'+parseEther('1000').toString(16)]);
  }
  provider.pollingInterval=100;
  if(Number(await provider.send('eth_chainId',[]))!==CHAIN_ID) throw new Error('Demo permits local chain 31337 only');
  const signers=Object.fromEntries(Object.entries(wallets).map(([role,w])=>[role,new NonceManager(w.connect(provider))]));
  const artifacts=compile();
  const operator=signers.operator;
  async function deploy(abi,bytecode,args=[]) {
    const c=await new ContractFactory(abi,bytecode,operator).deploy(...args);
    await c.waitForDeployment(); return c;
  }
  if(!manifest.nft) {
    const safeArtifact=artifact('@safe-global/safe-contracts/build/artifacts/contracts/Safe.sol/Safe.json');
    const factoryArtifact=artifact('@safe-global/safe-contracts/build/artifacts/contracts/proxies/SafeProxyFactory.sol/SafeProxyFactory.json');
    const singleton=await deploy(safeArtifact.abi,safeArtifact.bytecode);
    const factory=await deploy(factoryArtifact.abi,factoryArtifact.bytecode);
    const owners=Object.entries(wallets).filter(([r])=>r.startsWith('signer')).map(([,w])=>w.address);
    const setup=singleton.interface.encodeFunctionData('setup',[owners,3,ZeroAddress,'0x',ZeroAddress,ZeroAddress,0,ZeroAddress]);
    const receipt=await (await factory.createProxyWithNonce(await singleton.getAddress(),setup,Date.now())).wait();
    const event=receipt.logs.map(log=>{try{return factory.interface.parseLog(log);}catch{return null;}}).find(x=>x?.name==='ProxyCreation');
    if(!event) throw new Error('Safe deployment event missing');
    const safe=event.args.proxy;
    const nft=await deploy(artifacts.StudioRelease.abi,'0x'+artifacts.StudioRelease.evm.bytecode.object,[safe]);
    const token=await deploy(artifacts.DemoCredit.abi,'0x'+artifacts.DemoCredit.evm.bytecode.object,[wallets.buyer.address,wallets.seller.address]);
    manifest={...manifest,safe,safeSingleton:await singleton.getAddress(),safeFactory:await factory.getAddress(),
      safeThreshold:3,safeOwners:owners,nft:await nft.getAddress(),credit:await token.getAddress(),
      nftCodeHash:keccak256(await provider.getCode(await nft.getAddress())),
      safeCodeHash:keccak256(await provider.getCode(safe)),nftSourceHash:hash(fs.readFileSync(path.join(ROOT,'contracts','StudioRelease.sol'))),
      compiler:'solc 0.8.30 / shanghai',sameMachineDemoSigners:true};
    save('manifest.json',manifest);
  }
  const safeArtifact=artifact('@safe-global/safe-contracts/build/artifacts/contracts/Safe.sol/Safe.json');
  const safe=new Contract(manifest.safe,safeArtifact.abi,operator);
  const nft=new Contract(manifest.nft,artifacts.StudioRelease.abi,operator);
  const credit=new Contract(manifest.credit,artifacts.DemoCredit.abi,operator);
  const boson=new Contract(manifest.sourceBoson,bosonABI(),operator);
  const ctx={evm,provider,wallets,signers,manifest,safe,nft,credit,boson,artifacts};
  if(keccak256(await provider.getCode(manifest.nft))!==manifest.nftCodeHash ||
    keccak256(await provider.getCode(manifest.safe))!==manifest.safeCodeHash ||
    (await nft.owner()).toLowerCase()!==manifest.safe.toLowerCase() || Number(await safe.getThreshold())!==3)
    throw new Error('Deployed demo permissions or code changed');
  return ctx;
}

export async function safeProposal(ctx,to,data,count=3) {
  await assertRuntimeSafe(ctx);
  assertAllowedSafeCall(ctx,to,data);
  const issuedAtMonotonic=performance.now();
  const nonce=await ctx.safe.nonce();
  const args=[to,0,data,0,0,0,0,ZeroAddress,ZeroAddress,nonce];
  const digest=await ctx.safe.getTransactionHash(...args);
  const owners=Object.entries(ctx.wallets).filter(([r])=>r.startsWith('signer')).map(([,w])=>w)
    .sort((a,b)=>a.address.toLowerCase().localeCompare(b.address.toLowerCase())).slice(0,count);
  const signatures=concat(owners.map(w=>w.signingKey.sign(digest).serialized));
  const exec=[...args.slice(0,-1),signatures];
  return Object.freeze({digest,nonce,signatures,issuedAtMonotonic,exec:Object.freeze(exec),approvals:Object.freeze(owners.map(w=>w.address))});
}
export async function executeSafe(ctx,proposal) {
  await verifySafeProposal(ctx,proposal);
  await assertRuntimeSafe(ctx);
  if(await ctx.safe.nonce()!==proposal.nonce) throw new Error('Stale Safe nonce');
  if(!(await ctx.safe.execTransaction.staticCall(...proposal.exec))) throw new Error('Safe simulation failed');
  const receipt=ctx.transact?await ctx.transact('safe-execution',()=>ctx.safe.execTransaction.populateTransaction(...proposal.exec),{operation:ctx.marketRequest,safeApproval:proposal}):
    await (await ctx.safe.execTransaction(...proposal.exec,{gasLimit:1500000})).wait();
  const success=receipt.logs.some(log=>{try{return ctx.safe.interface.parseLog(log)?.name==='ExecutionSuccess';}catch{return false;}});
  if(receipt.status!==1 || !success) throw new Error('Safe operation failed');
  return receipt;
}

export function eventArgs(contract,receipt,name) {
  for(const log of receipt.logs) {
    if(log.address.toLowerCase()!==contract.target.toLowerCase()) continue;
    try {const parsed=contract.interface.parseLog(log);if(parsed?.name===name)return parsed.args;} catch {}
  }
  throw new Error(`Missing ${name} event`);
}
