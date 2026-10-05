import fs from 'node:fs';
import path from 'node:path';
import { JsonRpcProvider, FetchRequest, keccak256, formatEther } from 'ethers';
import { getSafeSingletonDeployment, getProxyFactoryDeployment } from '@safe-global/safe-deployments';
import { ROOT, artifact } from '../src/compile.mjs';
import { NETWORK, json } from '../src/chain.mjs';
import { BASE_RPC, BASE_CHECK_RPC, assertBase } from '../src/base-chain.mjs';
import { DEMO_HOME } from '../src/vault.mjs';

if(NETWORK!=='base-sepolia')throw new Error('Base Sepolia profile required');
const urls=[BASE_RPC,BASE_CHECK_RPC];
const providers=urls.map(url=>{const r=new FetchRequest(url);r.timeout=20000;
  return new JsonRpcProvider(r,84532,{staticNetwork:true,batchMaxCount:1,cacheTimeout:-1});});
try {
  const addresses=JSON.parse(fs.readFileSync(path.join(ROOT,'node_modules/@bosonprotocol/common/src/generated/protocolAddresses.json')));
  const boson=addresses.testing['84532'].protocolDiamond;
  const singleton=getSafeSingletonDeployment({version:'1.4.1',network:'84532'}).networkAddresses['84532'];
  const factory=getProxyFactoryDeployment({version:'1.4.1',network:'84532'}).networkAddresses['84532'];
  const expected=[
    keccak256(artifact('@safe-global/safe-contracts/build/artifacts/contracts/Safe.sol/Safe.json').deployedBytecode),
    keccak256(artifact('@safe-global/safe-contracts/build/artifacts/contracts/proxies/SafeProxyFactory.sol/SafeProxyFactory.json').deployedBytecode)
  ];
  const operator='0x89b99F8B686e58a598ecfC7c6321873D1DB672e8';
  const observations=[];
  for(let i=0;i<providers.length;i++) {
    const p=providers[i];await assertBase(p);
    const codes=await Promise.all([singleton,factory,boson].map(address=>p.getCode(address)));
    if(codes.some(code=>code==='0x'))throw new Error('Official contract has no public code');
    const codeHashes=codes.map(keccak256);
    if(codeHashes[0]!==expected[0]||codeHashes[1]!==expected[1])throw new Error('Safe runtime differs from pinned 1.4.1 artifacts');
    observations.push({rpc:urls[i],chainId:84532,codeHashes,operatorTestETH:formatEther(await p.getBalance(operator))});
  }
  if(JSON.stringify(observations[0].codeHashes)!==JSON.stringify(observations[1].codeHashes))throw new Error('Public RPC code hashes disagree');
  const result={schemaVersion:1,checkedAt:new Date().toISOString(),chainId:84532,
    officialSafe:{singleton,factory,version:'1.4.1'},officialBoson:{address:boson,config:'testing',commonVersion:'1.35.0'},
    operator,observations,publicDeploymentProven:false,
    scope:'Read-only network and official deployment compatibility. No NFT issuance or marketplace lifecycle proof.',
    status:Number(observations[0].operatorTestETH)>0?'funded-preflight':'funding-required'};
  for(const file of [path.join(ROOT,'evidence/BASE_PREFLIGHT.json'),path.join(DEMO_HOME,'BASE_PREFLIGHT.json')])fs.writeFileSync(file,json(result)+'\n',{mode:0o600});
  console.log('PASS Base Sepolia 84532; both public RPCs agree on official Safe and Boson code.');
  console.log('Operator test ETH:',observations[0].operatorTestETH,'Status:',result.status);
}finally{for(const p of providers)p.destroy();}
