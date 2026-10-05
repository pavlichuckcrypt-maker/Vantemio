// One resumable TEST pause/unpause cycle through the application, never minting/buying.
import assert from 'node:assert/strict';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Contract,FetchRequest,JsonRpcProvider,getBytes,hexlify,recoverAddress,ZeroAddress} from 'ethers';
import {ROOT,artifact,compile} from '../src/compile.mjs';
import {load,save,json} from '../src/chain.mjs';
import {BASE_RPC,BASE_CHECK_RPC} from '../src/base-chain.mjs';
import {assertSafeAuthority} from '../src/safe-authority.mjs';
import {writeDurableJSON} from '../src/durable-json.mjs';
const origin='http://127.0.0.1:18339',probeName='live-safe-operation-probe.json';
if(process.env.AIM_DEMO_NETWORK!=='base-sepolia')throw new Error('Explicit Base profile required');
async function state(){const r=await fetch(origin+'/api/state',{signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);const s=await r.json();assert.equal(s.manifest.chainId,84532);assert.equal(s.active,null);assert.equal(s.pendingTransaction,false);assert.equal(s.chainView?.verified,true);return s;}
let probe=load(probeName);
async function send(which){const s=await state();const r=await fetch(origin+'/api/market/action',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Demo-CSRF':s.csrf,Connection:'close'},body:JSON.stringify(probe[which].input),signal:AbortSignal.timeout(180000)});const result=await r.json();if(!r.ok)throw new Error(result.error);assert.ok(result.result.tx);probe[which].tx=result.result.tx;save(probeName,probe);return result.result;}
const providers=[BASE_RPC,BASE_CHECK_RPC].map(url=>{const f=new FetchRequest(url);f.timeout=20000;return new JsonRpcProvider(f,84532,{staticNetwork:true,batchMaxCount:1,cacheTimeout:-1});});
try{
 let s=await state();
 if(!probe){assert.equal(s.paused,false);probe={status:'prepared',preparedAt:new Date().toISOString(),receiptCountBefore:s.receipts.length,pause:{input:{action:'pauseMarket',paused:true,idempotencyKey:randomUUID()}},resume:{input:{action:'pauseMarket',paused:false,idempotencyKey:randomUUID()}}};save(probeName,probe);}
 if(!probe.pause.tx){probe.status='pause-started';save(probeName,probe);await send('pause');}
 if(!probe.resume.tx){probe.status='resume-started';save(probeName,probe);await send('resume');}
 s=await state();assert.equal(s.paused,false);const count=s.receipts.length;
 for(const which of ['pause','resume']){const replay=await send(which);assert.equal(replay.idempotent,true);}
 s=await state();assert.equal(s.receipts.length,count);assert.equal(s.paused,false);
 const proofs=[];
 for(const [which,expectedPaused]of [['pause',true],['resume',false]]){
  const observations=await Promise.all(providers.map(async provider=>{
   const safe=new Contract(s.manifest.safe,artifact('@safe-global/safe-contracts/build/artifacts/contracts/Safe.sol/Safe.json').abi,provider),nft=new Contract(s.manifest.nft,compile().StudioRelease.abi,provider);
   const receipt=await provider.getTransactionReceipt(probe[which].tx);assert.equal(receipt?.status,1);assert.ok(await receipt.confirmations()>=3);assert.equal((await provider.getBlock(receipt.blockNumber)).hash,receipt.blockHash);
   const tx=await provider.getTransaction(probe[which].tx),outer=safe.interface.parseTransaction({data:tx.data});assert.equal(outer.name,'execTransaction');assert.equal(tx.chainId,84532n);assert.equal(tx.value,0n);assert.equal(tx.from.toLowerCase(),s.wallets.find(w=>w.role==='operator').address.toLowerCase());assert.equal(tx.to.toLowerCase(),s.manifest.safe.toLowerCase());assert.equal(outer.args[0].toLowerCase(),s.manifest.nft.toLowerCase());assert.equal(outer.args[1],0n);for(const i of [3,4,5,6])assert.equal(outer.args[i],0n);for(const i of [7,8])assert.equal(outer.args[i],ZeroAddress);
   const inner=nft.interface.parseTransaction({data:outer.args[2]});assert.equal(inner.name,expectedPaused?'pause':'unpause');assert.equal(await nft.paused({blockTag:receipt.blockNumber}),expectedPaused);
   const event=receipt.logs.map(log=>{try{return safe.interface.parseLog(log);}catch{return null;}}).find(e=>e?.name==='ExecutionSuccess');assert.ok(event);
   const nonce=await safe.nonce({blockTag:receipt.blockNumber-1}),digest=await safe.getTransactionHash(...Array.from(outer.args).slice(0,9),nonce,{blockTag:receipt.blockNumber});assert.equal(digest,event.args.txHash);
   const bytes=getBytes(outer.args[9]);assert.equal(bytes.length,195);const recovered=Array.from({length:3},(_,i)=>recoverAddress(digest,hexlify(bytes.slice(i*65,(i+1)*65))));assert.equal(new Set(recovered).size,3);assert.ok(recovered.every((a,i)=>s.manifest.safeOwners.map(x=>x.toLowerCase()).includes(a.toLowerCase())&&(i===0||recovered[i-1].toLowerCase()<a.toLowerCase())));
   await assertSafeAuthority({manifest:s.manifest,provider,safe},{blockTag:receipt.blockNumber});
   return {transaction:probe[which].tx,block:{number:receipt.blockNumber,hash:receipt.blockHash},method:inner.name,digest,approvalAddresses:recovered,safeNonceBefore:nonce.toString(),pausedAtReceiptBlock:expectedPaused};
  }));assert.deepEqual(observations[0],observations[1]);proofs.push(observations[0]);
 }
 assert.equal(s.receipts.length,probe.receiptCountBefore+2);
 const report={verifiedAt:new Date().toISOString(),passed:true,chainId:84532,testOnly:true,providersVerified:2,operations:proofs,pausedAfter:false,replayCreatedTransactions:0,receiptCountBefore:probe.receiptCountBefore,receiptCountAfter:s.receipts.length,scope:'One actual HTTP Safe pause/unpause cycle using the bound proposal and final pre-broadcast guard. Two successful canonical receipts, three confirmations, exact nested NFT-only calls, ExecutionSuccess digest and recovered sorted three registered signers, authority and historical pause states verified on two RPCs. Same-key repeats add no writes. No content, NFT, offer, order or currency transfer created.'};
 writeDurableJSON(path.join(ROOT,'evidence/LIVE_SAFE_OPERATION_VERIFICATION.json'),json(report)+'\n');probe.status='completed';probe.completedAt=report.verifiedAt;save(probeName,probe);console.log(json(report));
}catch(e){
 // If our own pause was sent, attempt only the persisted matching resume key.
 try{if(probe&&probe.status!=='completed'&&probe.status!=='prepared'&&!load('pending.json')){const s=await state();if(s.paused)await send('resume');}}catch{}
 console.error('LIVE_SAFE_VERIFY_FAILED:',e.shortMessage||e.message,'Inspect the private probe; never replace its keys or resend an unresolved pending transaction.');process.exitCode=1;
}finally{providers.forEach(p=>p.destroy());}
