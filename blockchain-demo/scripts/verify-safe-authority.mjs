// Real two-RPC Safe reads; rejection probes change copies of observed responses only.
import assert from 'node:assert/strict';
import path from 'node:path';
import {Contract,FetchRequest,JsonRpcProvider} from 'ethers';
import {ROOT,artifact} from '../src/compile.mjs';
import {load,json,safeProposal} from '../src/chain.mjs';
import {BASE_RPC,BASE_CHECK_RPC} from '../src/base-chain.mjs';
import {assertSafeAuthority,assertRuntimeSafe,SAFE_MODULE_SENTINEL,SAFE_GUARD_SLOT,SAFE_FALLBACK_SLOT} from '../src/safe-authority.mjs';
import {mintRelease} from '../src/releases.mjs';
import {writeDurableJSON} from '../src/durable-json.mjs';
if(process.env.AIM_DEMO_NETWORK!=='base-sepolia')throw new Error('Explicit Base profile required');
const manifest=load('manifest.json'),before=load('public-receipts.json').length;
if(manifest?.chainId!==84532||!manifest.publicTransactions||load('pending.json'))throw new Error('Idle public Base required');
const providers=[BASE_RPC,BASE_CHECK_RPC].map(url=>{const f=new FetchRequest(url);f.timeout=20000;return new JsonRpcProvider(f,84532,{staticNetwork:true,batchMaxCount:1,cacheTimeout:-1});});
try{
 const blockTag=Math.min(...await Promise.all(providers.map(p=>p.getBlockNumber())))-2;
 const contexts=providers.map(provider=>({provider,manifest,safe:new Contract(manifest.safe,artifact('@safe-global/safe-contracts/build/artifacts/contracts/Safe.sol/Safe.json').abi,provider)}));
 const results=await Promise.all(contexts.map(ctx=>assertSafeAuthority(ctx,{blockTag})));
 assert.deepEqual(results[0],results[1]);
 const snapshot=results[0],p=providers[0],block=await p.getBlock(blockTag);
 const observed={proxy:await p.getCode(manifest.safe,blockTag),singleton:await p.getCode(manifest.safeSingleton,blockTag),masterCopy:await p.getStorage(manifest.safe,0,blockTag),owners:snapshot.owners,threshold:3,modules:[[],SAFE_MODULE_SENTINEL],guard:'0x'+'0'.repeat(64),fallback:'0x'+'0'.repeat(64),chain:'0x14a34',blockHash:block.hash};
 const probes=[];
 const cases=[['master-copy',o=>o.masterCopy='0x'+'f'.repeat(64)],['singleton-code',o=>o.singleton='0x6000'],['proxy-code',o=>o.proxy='0x6000'],['enabled-module',o=>o.modules=[['0x'+'f'.repeat(40)],SAFE_MODULE_SENTINEL]],['module-pagination',o=>o.modules=[[],snapshot.safe]],['guard',o=>o.guard='0x'+'1'.repeat(64)],['fallback',o=>o.fallback='0x'+'1'.repeat(64)],['replaced-owner',o=>o.owners[0]='0x'+'f'.repeat(40)],['threshold',o=>o.threshold=2],['reorg',o=>o.blockHash='0x'+'f'.repeat(64)],['wrong-network',o=>o.chain='0x1']];
 for(const [name,alter]of cases){
  const o=structuredClone(observed);alter(o);let blockReads=0;
  const provider={send:async()=>o.chain,getBlock:async()=>({...block,hash:++blockReads===1?block.hash:o.blockHash}),getCode:async address=>address.toLowerCase()===manifest.safe.toLowerCase()?o.proxy:o.singleton,getStorage:async(_a,slot)=>slot===0?o.masterCopy:slot===SAFE_GUARD_SLOT?o.guard:slot===SAFE_FALLBACK_SLOT?o.fallback:assert.fail('Unexpected storage slot')};
  const ctx={manifest,provider,safe:{getOwners:async()=>o.owners,getThreshold:async()=>o.threshold,getModulesPaginated:async()=>o.modules,nonce:()=>assert.fail('Refusal must precede Safe nonce/signatures')}};
  ctx.assertAuthority=()=>assertSafeAuthority(ctx,{blockTag});
  await assert.rejects(ctx.assertAuthority());
  await assert.rejects(safeProposal(ctx,manifest.nft,'0x'));
  await assert.rejects(mintRelease(ctx,{}));
  probes.push({name,refusedBeforeProposalSigningAndNftDomainWork:true,method:'In-memory alteration of actual observed Safe responses; no live configuration change'});
 }
 await assert.rejects(assertRuntimeSafe({manifest}),/verifier missing/);probes.push({name:'missing-runtime-verifier',refused:true});
 const after=load('public-receipts.json').length;if(after!==before||load('pending.json'))throw new Error('Writes overlapped Safe verification');
 const report={verifiedAt:new Date().toISOString(),passed:true,chainId:84532,testOnly:true,providersVerified:2,authority:snapshot,probes,chainWritesCreated:0,nativeTransactionsSigned:0,receiptCountBefore:before,receiptCountAfter:after,checks:['Official pinned Safe 1.4.1 proxy and singleton bytecode, storage implementation pointer','Exactly five registered owners and threshold three','No enabled modules, guard or fallback handler','All configuration reads in one canonical block with two-RPC agreement','Runtime startup, NFT publication, Safe signing, commerce/delivery approval, live view and final broadcast require authority verification'],limits:'Configuration observed at the recorded block. Negative probes use copied responses, not live upgrades or module installations. All demo signers share one Mac; this does not provide independent custody. A pre-broadcast read cannot prevent a separate authorized Safe configuration change after broadcast and before mining.'};
 writeDurableJSON(path.join(ROOT,'evidence/SAFE_AUTHORITY_VERIFICATION.json'),json(report)+'\n');console.log(json(report));
}finally{providers.forEach(p=>p.destroy());}
