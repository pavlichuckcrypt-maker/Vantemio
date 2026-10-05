import fs from 'node:fs';
import path from 'node:path';
import { Contract, ContractFactory, JsonRpcProvider, FetchRequest, NonceManager, ZeroAddress, keccak256, parseEther } from 'ethers';
import { getSafeSingletonDeployment, getProxyFactoryDeployment } from '@safe-global/safe-deployments';
import { compile, artifact, ROOT } from './compile.mjs';
import { NETWORK, RUNTIME, save, load, hash, eventArgs, bosonABI } from './chain.mjs';
import { broadcastJournaled } from './public-journal.mjs';
import {assertBosonImplementation} from './boson-implementation.mjs';
import {verifyCommerceBroadcast} from './commerce-policy.mjs';
import {assertSafeAuthority} from './safe-authority.mjs';
import {verifySafeBroadcast} from './safe-operation.mjs';

export const BASE_RPC='https://sepolia.base.org';
export const BASE_CHECK_RPC='https://base-sepolia-rpc.publicnode.com';
export const EXPLORER='https://sepolia.basescan.org';
export const BASE_CHAIN_ID=84532;
export async function assertBase(provider) {
  if(Number(await provider.send('eth_chainId',[]))!==84532)throw new Error('Only public Base Sepolia 84532 is allowed; no mainnet or local substitute');
  return true;
}
export async function connectBase(wallets,{deploy=false}={}) {
  if(NETWORK!=='base-sepolia')throw new Error('Set AIM_DEMO_NETWORK=base-sepolia explicitly');
  fs.mkdirSync(RUNTIME,{recursive:true,mode:0o700});
  const request=new FetchRequest(BASE_RPC);request.timeout=20000;
  const provider=new JsonRpcProvider(request,84532,{staticNetwork:true,cacheTimeout:-1,batchMaxCount:1});
  provider.pollingInterval=1000;await assertBase(provider);
  const signers=Object.fromEntries(Object.entries(wallets).map(([role,w])=>[role,new NonceManager(w.connect(provider))]));
  const singleton=getSafeSingletonDeployment({version:'1.4.1',network:'84532'});
  const factoryDeployment=getProxyFactoryDeployment({version:'1.4.1',network:'84532'});
  if(!singleton||!factoryDeployment)throw new Error('Official Safe deployment registry lacks Base Sepolia');
  const safeSingleton=singleton.networkAddresses['84532'],safeFactory=factoryDeployment.networkAddresses['84532'];
  if(typeof safeSingleton!=='string'||typeof safeFactory!=='string')throw new Error('Ambiguous Safe registry entry');
  const safeArtifact=artifact('@safe-global/safe-contracts/build/artifacts/contracts/Safe.sol/Safe.json');
  const factoryArtifact=artifact('@safe-global/safe-contracts/build/artifacts/contracts/proxies/SafeProxyFactory.sol/SafeProxyFactory.json');
  for(const [address,a] of [[safeSingleton,safeArtifact],[safeFactory,factoryArtifact]]) {
    if(keccak256(await provider.getCode(address))!==keccak256(a.deployedBytecode))throw new Error('Official Safe code differs from pinned 1.4.1 artifact');
  }
  let manifest=load('manifest.json',{schemaVersion:1,mode:'public-base-sepolia',chainId:84532,rpc:BASE_RPC,
    explorer:EXPLORER,publicTransactions:true,safeSingleton,safeFactory,safeThreshold:3,
    sameMachineDemoSigners:true,createdAt:new Date().toISOString()});
  if(manifest.chainId!==84532||manifest.mode!=='public-base-sepolia'||manifest.rpc!==BASE_RPC)
    throw new Error('Base deployment manifest mismatch');
  const transact=async(label,populate,{role='operator',gasFunding=false,operation=null,commerceApproval=null,safeApproval=null}={})=>{
    await assertBase(provider);
    const pending=load('pending.json');
    if(pending)throw new Error('Unreconciled public transaction '+pending.tx+'; verify its receipt before retry');
    const request=await populate();
    request.chainId=84532;request.from=wallets[role].address;
    if(request.to&&[manifest.sourceBoson,manifest.credit].filter(Boolean).some(a=>a.toLowerCase()===request.to.toLowerCase())&&!commerceApproval)throw new Error('Protected commerce transaction requires a verified approval bundle');
    if(request.to?.toLowerCase()===manifest.safe?.toLowerCase()&&!safeApproval)throw new Error('Safe transaction requires a bound proposal');
    const gas=await provider.estimateGas(request);
    const fees=await provider.getFeeData(); const gasPrice=fees.maxFeePerGas; if(!gasPrice)throw new Error('Missing EIP1559 fees');
    if(gasPrice>1000000000n||gas>5000000n||((request.value??0n)!==0n&&!(gasFunding&&['buyer','seller','resolver'].some(r=>wallets[r].address.toLowerCase()===request.to?.toLowerCase())&&request.value<=parseEther('0.0002'))))throw new Error('Demo transaction fee/value limit exceeded');
    const gasLimit=gas*120n/100n;
    if(await provider.getBalance(wallets[role].address)<gasLimit*gasPrice+(request.value??0n)+parseEther('0.00002'))
      throw new Error('Insufficient public test ETH for '+label+'; prefunding/faucet is required');
    if(request.to&&[manifest.sourceBoson,manifest.credit].filter(Boolean).some(a=>a.toLowerCase()===request.to.toLowerCase()))await assertBosonImplementation(provider,manifest);
    const tx=await broadcastJournaled({provider,wallet:wallets[role].connect(provider),
      request:{...request,gasLimit,maxFeePerGas:gasPrice,maxPriorityFeePerGas:fees.maxPriorityFeePerGas,type:2},label,role,operation,
      store:record=>save('pending.json',record),read:()=>load('pending.json'),beforeBroadcast:async prepared=>{
        if(commerceApproval)await verifyCommerceBroadcast(ctx,role,prepared,commerceApproval,{expectedAction:label});
        else if(prepared.to&&[manifest.sourceBoson,manifest.credit].filter(Boolean).some(a=>a.toLowerCase()===prepared.to.toLowerCase()))await assertBosonImplementation(provider,manifest);
        if(safeApproval)await verifySafeBroadcast(ctx,role,prepared,safeApproval);
        else if(prepared.to?.toLowerCase()===manifest.safe?.toLowerCase())throw new Error('Safe transaction requires a bound proposal');
      }});
    const receipt=await tx.wait(3,120000);
    if(!receipt||receipt.status!==1)throw new Error('Public transaction reverted: '+tx.hash);
    const block=await provider.getBlock(receipt.blockNumber);
    if(block.hash!==receipt.blockHash)throw new Error('Receipt is not in the canonical Base block');
    const records=load('public-receipts.json',[]);
    const record={label,role,chainId:84532,tx:receipt.hash,block:receipt.blockNumber,blockHash:receipt.blockHash,gasUsed:receipt.gasUsed.toString(),status:1,
      explorer:EXPLORER+'/tx/'+receipt.hash,confirmations:3};
    records.push(record);save('public-receipts.json',records);
    if(operation){const intents=load('confirmed-intents.json',[]);intents.push({...record,operation});save('confirmed-intents.json',intents);}
    fs.unlinkSync(path.join(RUNTIME,'pending.json'));return receipt;
  };
  const artifacts=compile();
  if(deploy&&!manifest.safe){
    const owners=Object.entries(wallets).filter(([r])=>r.startsWith('signer')).map(([,w])=>w.address);
    const singletonContract=new Contract(safeSingleton,safeArtifact.abi,signers.operator);
    const factory=new Contract(safeFactory,factoryArtifact.abi,signers.operator);
    const setup=singletonContract.interface.encodeFunctionData('setup',[owners,3,ZeroAddress,'0x',ZeroAddress,ZeroAddress,0,ZeroAddress]);
    const receipt=await transact('deploy-safe',()=>factory.createProxyWithNonce.populateTransaction(safeSingleton,setup,84532));
    manifest={...manifest,safe:eventArgs(factory,receipt,'ProxyCreation').proxy,safeOwners:owners};save('manifest.json',manifest);
  }
  if(deploy&&manifest.safe&&!manifest.nft){
    const factory=new ContractFactory(artifacts.StudioRelease.abi,'0x'+artifacts.StudioRelease.evm.bytecode.object,signers.operator);
    const receipt=await transact('deploy-nft',()=>factory.getDeployTransaction(manifest.safe));
    manifest={...manifest,nft:receipt.contractAddress,nftCodeHash:keccak256(await provider.getCode(receipt.contractAddress)),
      safeCodeHash:keccak256(await provider.getCode(manifest.safe)),nftSourceHash:hash(fs.readFileSync(path.join(ROOT,'contracts/StudioRelease.sol'))),compiler:'solc 0.8.30 / shanghai'};
    save('manifest.json',manifest);
  }

  const addresses=JSON.parse(fs.readFileSync(path.join(ROOT,'node_modules/@bosonprotocol/common/src/generated/protocolAddresses.json'),'utf8'));
  const sourceBoson=addresses.testing['84532'].protocolDiamond;
  const sourceBosonCodeHash=keccak256(await provider.getCode(sourceBoson));
  if(await provider.getCode(sourceBoson)==='0x')throw new Error('Official Boson Base Sepolia deployment has no code');
  if(manifest.sourceBoson&&(manifest.sourceBoson!==sourceBoson||manifest.sourceBosonCodeHash!==sourceBosonCodeHash))throw new Error('Boson deployment changed');
  manifest={...manifest,sourceBoson,sourceBosonCodeHash};const implementation=await assertBosonImplementation(provider,manifest);
  manifest={...manifest,sourceBosonImplementationDigest:implementation.digest};save('manifest.json',manifest);
  if(deploy&&manifest.nft&&!manifest.credit){
    const factory=new ContractFactory(artifacts.DemoCredit.abi,'0x'+artifacts.DemoCredit.evm.bytecode.object,signers.operator);
    const receipt=await transact('deploy-demo-credit',()=>factory.getDeployTransaction(wallets.buyer.address,wallets.seller.address));
    manifest={...manifest,credit:receipt.contractAddress,creditCodeHash:keccak256(await provider.getCode(receipt.contractAddress))};save('manifest.json',manifest);
  }
  if(deploy&&manifest.credit){
    for(const role of ['buyer','seller','resolver'])if(await provider.getBalance(wallets[role].address)<parseEther('0.00005'))
      await transact('fund-demo-'+role,async()=>({to:wallets[role].address,value:parseEther('0.00008')}),{gasFunding:true});
  }
  const ctx={provider,wallets,signers,manifest,artifacts,transact,assertChain:()=>assertBase(provider),assertProtocol:options=>assertBosonImplementation(provider,manifest,options),assertAuthority:options=>assertSafeAuthority(ctx,options)};
  if(manifest.nft){
    ctx.safe=new Contract(manifest.safe,safeArtifact.abi,signers.operator);
    ctx.nft=new Contract(manifest.nft,artifacts.StudioRelease.abi,signers.operator);
    if(keccak256(await provider.getCode(manifest.nft))!==manifest.nftCodeHash||
       keccak256(await provider.getCode(manifest.safe))!==manifest.safeCodeHash||
       (await ctx.nft.owner()).toLowerCase()!==manifest.safe.toLowerCase()||Number(await ctx.safe.getThreshold())!==3)
      throw new Error('Base contracts/authority differ from the deployment manifest');
    const actual=(await ctx.safe.getOwners()).map(x=>x.toLowerCase()).sort();
    if(JSON.stringify(actual)!==JSON.stringify(manifest.safeOwners.map(x=>x.toLowerCase()).sort()))throw new Error('Safe owners changed');
    await assertSafeAuthority(ctx);
  }
  if(manifest.credit){if(keccak256(await provider.getCode(manifest.credit))!==manifest.creditCodeHash)throw new Error('Demo credit code changed');ctx.credit=new Contract(manifest.credit,artifacts.DemoCredit.abi,signers.operator);ctx.boson=new Contract(sourceBoson,bosonABI(),signers.operator);}
  return ctx;
}
