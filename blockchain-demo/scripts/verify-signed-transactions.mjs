// Validate reconstructed public signed transactions without creating/signing/broadcasting any.
import assert from 'node:assert/strict';
import path from 'node:path';
import {FetchRequest,JsonRpcProvider,Transaction} from 'ethers';
import {ROOT} from '../src/compile.mjs';
import {load,json} from '../src/chain.mjs';
import {BASE_RPC,BASE_CHECK_RPC,assertBase} from '../src/base-chain.mjs';
import {bindPreparedTransaction,verifySignedTransaction} from '../src/signed-transaction.mjs';
import {writeDurableJSON} from '../src/durable-json.mjs';
if(process.env.AIM_DEMO_NETWORK!=='base-sepolia'||load('pending.json'))throw new Error('Idle explicit Base required');
const records=load('public-receipts.json'),before=records.length;
const response=await fetch('http://127.0.0.1:18339/api/evidence',{signal:AbortSignal.timeout(30000)});assert.equal(response.status,200);const state=await response.json();assert.equal(state.manifest.chainId,84532);assert.equal(state.active,null);assert.equal(state.pendingTransaction,false);
const providers=[BASE_RPC,BASE_CHECK_RPC].map(url=>{const f=new FetchRequest(url);f.timeout=20000;return new JsonRpcProvider(f,84532,{staticNetwork:true,batchMaxCount:1,cacheTimeout:-1});});
try{
 for(const p of providers)await assertBase(p);
 const proofs=[];let example;
 for(const record of records){
  const results=await Promise.all(providers.map(async provider=>{
   const tx=await provider.getTransaction(record.tx);assert.ok(tx);assert.equal(tx.hash,record.tx);assert.equal(tx.blockHash,record.blockHash);assert.equal((await provider.getBlock(tx.blockNumber)).hash,record.blockHash);
   const actor=state.wallets.find(w=>w.role===record.role)?.address;assert.ok(actor);assert.equal(tx.from.toLowerCase(),actor.toLowerCase());
   const parsed=Transaction.from(tx),binding=bindPreparedTransaction(tx,tx,actor),bound=verifySignedTransaction(parsed.serialized,binding);assert.equal(parsed.hash,record.tx);
   return {transaction:record.tx,label:record.label,role:record.role,from:bound.from,to:bound.to,nonce:bound.nonce,block:{number:tx.blockNumber,hash:tx.blockHash},signedBytesValidated:true};
  }));assert.deepEqual(results[0],results[1]);proofs.push(results[0]);
  if(record===records.at(-1))example=await providers[0].getTransaction(record.tx);
 }
 const parsed=Transaction.from(example),binding=bindPreparedTransaction(example,example,example.from),probes=[];
 const changes=[['target',t=>t.to=state.manifest.credit],['data',t=>t.data='0x1234'],['nonce',t=>t.nonce++],['value',t=>t.value=1n],['network',t=>t.chainId=8453n],['gas',t=>t.gasLimit++],['max-fee',t=>t.maxFeePerGas++],['priority-fee',t=>t.maxPriorityFeePerGas++]];
 for(const [name,alter]of changes){const modified=Transaction.from(parsed);alter(modified);assert.throws(()=>verifySignedTransaction(modified.serialized,binding));probes.push({name,refused:true,method:'Public transaction fields changed only in memory; no signing or broadcast'});}
 assert.throws(()=>verifySignedTransaction(parsed.unsignedSerialized,binding));probes.push({name:'unsigned',refused:true});
 assert.equal(load('public-receipts.json').length,before);assert.equal(load('pending.json'),null);
 const report={verifiedAt:new Date().toISOString(),passed:true,chainId:84532,testOnly:true,providersVerified:2,transactionsVerified:proofs.length,proofs,probes,nativeTransactionsSigned:0,chainWritesCreated:0,receiptCountBefore:before,receiptCountAfter:before,scope:'Actual public transaction fields/signatures reconstructed from both RPCs; canonical blocks, registered actor, transaction hash and signed/unsigned serialization checked using the same runtime validator. All observed records pass. Negative changes use public bytes in memory. Runtime snapshots caller fields before async preparation, forbids validated field changes, verifies the recovered signer and exact signed fields/fees, gives final guards a frozen canonical request, and journals these actual bytes before sending. This does not prove confidentiality of demo keys or independently audit ethers; no new native transaction was signed or broadcast.'};
 writeDurableJSON(path.join(ROOT,'evidence/SIGNED_TRANSACTION_VERIFICATION.json'),json(report)+'\n');console.log(json({...report,proofs:undefined}));
}finally{providers.forEach(p=>p.destroy());}
