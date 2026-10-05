import fs from 'node:fs';
import path from 'node:path';
import { Contract, ContractFactory, JsonRpcProvider, FetchRequest, NonceManager, ZeroAddress, keccak256, parseEther } from 'ethers';
import { getSafeSingletonDeployment, getProxyFactoryDeployment } from '@safe-global/safe-deployments';
import { compile, artifact, ROOT } from './compile.mjs';
import { NETWORK, RUNTIME, save, load, hash, eventArgs } from './chain.mjs';

export const BSC_RPC='https://bsc-testnet.bnbchain.org';
export const BSC_CHECK_RPC='https://bsc-testnet-dataseed.bnbchain.org';
export const EXPLORER='https://testnet.bscscan.com';
export const BSC_CHAIN_ID=97;
export async function assertBsc(provider) {
  if(Number(await provider.send('eth_chainId',[]))!==97)throw new Error('Only public BSC Testnet 97 is allowed; no mainnet or local substitute');
  return true;
}
export async function connectBsc(wallets,{deploy=false}={}) {
  if(NETWORK!=='bsc-testnet')throw new Error('Set AIM_DEMO_NETWORK=bsc-testnet explicitly');
  fs.mkdirSync(RUNTIME,{recursive:true,mode:0o700});
  const request=new FetchRequest(BSC_RPC);request.timeout=20000;
  const provider=new JsonRpcProvider(request,97,{staticNetwork:true,cacheTimeout:-1,batchMaxCount:1});
  provider.pollingInterval=1000;await assertBsc(provider);
  const signers=Object.fromEntries(Object.entries(wallets).map(([role,w])=>[role,new NonceManager(w.connect(provider))]));
  const singleton=getSafeSingletonDeployment({version:'1.4.1',network:'97'});
  const factoryDeployment=getProxyFactoryDeployment({version:'1.4.1',network:'97'});
  if(!singleton||!factoryDeployment)throw new Error('Official Safe deployment registry lacks BSC Testnet');
  const safeSingleton=singleton.networkAddresses['97'],safeFactory=factoryDeployment.networkAddresses['97'];
  if(typeof safeSingleton!=='string'||typeof safeFactory!=='string')throw new Error('Ambiguous Safe registry entry');
  const safeArtifact=artifact('@safe-global/safe-contracts/build/artifacts/contracts/Safe.sol/Safe.json');
  const factoryArtifact=artifact('@safe-global/safe-contracts/build/artifacts/contracts/proxies/SafeProxyFactory.sol/SafeProxyFactory.json');
  for(const [address,a] of [[safeSingleton,safeArtifact],[safeFactory,factoryArtifact]]) {
    if(keccak256(await provider.getCode(address))!==keccak256(a.deployedBytecode))throw new Error('Official Safe code differs from pinned 1.4.1 artifact');
  }
  let manifest=load('manifest.json',{schemaVersion:1,mode:'public-bsc-testnet',chainId:97,rpc:BSC_RPC,
    explorer:EXPLORER,publicTransactions:true,safeSingleton,safeFactory,safeThreshold:3,
    sameMachineDemoSigners:true,createdAt:new Date().toISOString()});
  if(manifest.chainId!==97||manifest.mode!=='public-bsc-testnet'||manifest.rpc!==BSC_RPC)
    throw new Error('BSC deployment manifest mismatch');
  const transact=async(label,populate)=>{
    await assertBsc(provider);
    const pending=load('pending.json');
    if(pending)throw new Error('Unreconciled public transaction '+pending.tx+'; verify its receipt before retry');
    const request=await populate();
    request.chainId=97;request.from=wallets.operator.address;
    const gas=await provider.estimateGas(request);
    const gasPrice=BigInt(await provider.send('eth_gasPrice',[]));
    if(gasPrice>1000000000n||gas>5000000n||(request.value??0n)!==0n)throw new Error('Demo transaction fee/value limit exceeded');
    const gasLimit=gas*120n/100n;
    if(await provider.getBalance(wallets.operator.address)<gasLimit*gasPrice+parseEther('0.000005'))
      throw new Error('Insufficient public tBNB for '+label+'; prefunding/faucet is required');
    const tx=await signers.operator.sendTransaction({...request,gasLimit,gasPrice,type:0});
    save('pending.json',{tx:tx.hash,label,at:new Date().toISOString()});
    const receipt=await tx.wait(3,120000);
    if(!receipt||receipt.status!==1)throw new Error('Public transaction reverted: '+tx.hash);
    const block=await provider.getBlock(receipt.blockNumber);
    if(block.hash!==receipt.blockHash)throw new Error('Receipt is not in the canonical BSC block');
    const records=load('public-receipts.json',[]);
    records.push({label,tx:receipt.hash,block:receipt.blockNumber,blockHash:receipt.blockHash,gasUsed:receipt.gasUsed.toString(),status:1,
      explorer:EXPLORER+'/tx/'+receipt.hash,confirmations:3});save('public-receipts.json',records);
    fs.unlinkSync(path.join(RUNTIME,'pending.json'));return receipt;
  };
  const artifacts=compile();
  if(deploy&&!manifest.safe){
    const owners=Object.entries(wallets).filter(([r])=>r.startsWith('signer')).map(([,w])=>w.address);
    const singletonContract=new Contract(safeSingleton,safeArtifact.abi,signers.operator);
    const factory=new Contract(safeFactory,factoryArtifact.abi,signers.operator);
    const setup=singletonContract.interface.encodeFunctionData('setup',[owners,3,ZeroAddress,'0x',ZeroAddress,ZeroAddress,0,ZeroAddress]);
    const receipt=await transact('deploy-safe',()=>factory.createProxyWithNonce.populateTransaction(safeSingleton,setup,97));
    manifest={...manifest,safe:eventArgs(factory,receipt,'ProxyCreation').proxy,safeOwners:owners};save('manifest.json',manifest);
  }
  if(deploy&&manifest.safe&&!manifest.nft){
    const factory=new ContractFactory(artifacts.StudioRelease.abi,'0x'+artifacts.StudioRelease.evm.bytecode.object,signers.operator);
    const receipt=await transact('deploy-nft',()=>factory.getDeployTransaction(manifest.safe));
    manifest={...manifest,nft:receipt.contractAddress,nftCodeHash:keccak256(await provider.getCode(receipt.contractAddress)),
      safeCodeHash:keccak256(await provider.getCode(manifest.safe)),nftSourceHash:hash(fs.readFileSync(path.join(ROOT,'contracts/StudioRelease.sol'))),compiler:'solc 0.8.30 / shanghai'};
    save('manifest.json',manifest);
  }
  const ctx={provider,wallets,signers,manifest,artifacts,transact,assertChain:()=>assertBsc(provider)};
  if(manifest.nft){
    ctx.safe=new Contract(manifest.safe,safeArtifact.abi,signers.operator);
    ctx.nft=new Contract(manifest.nft,artifacts.StudioRelease.abi,signers.operator);
    if(keccak256(await provider.getCode(manifest.nft))!==manifest.nftCodeHash||
       keccak256(await provider.getCode(manifest.safe))!==manifest.safeCodeHash||
       (await ctx.nft.owner()).toLowerCase()!==manifest.safe.toLowerCase()||Number(await ctx.safe.getThreshold())!==3)
      throw new Error('BSC contracts/authority differ from the deployment manifest');
    const actual=(await ctx.safe.getOwners()).map(x=>x.toLowerCase()).sort();
    if(JSON.stringify(actual)!==JSON.stringify(manifest.safeOwners.map(x=>x.toLowerCase()).sort()))throw new Error('Safe owners changed');
  }
  return ctx;
}
