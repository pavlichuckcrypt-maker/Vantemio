import test from 'node:test';
import assert from 'node:assert/strict';
import {Wallet,Transaction} from 'ethers';
import {bindPreparedTransaction,verifySignedTransaction} from '../src/signed-transaction.mjs';
import {broadcastJournaled} from '../src/public-journal.mjs';
function fixture(){const wallet=Wallet.createRandom(),other=Wallet.createRandom();const request={chainId:84532,nonce:4,to:other.address,data:'0x1234',value:0n,type:2,gasLimit:100000n,maxFeePerGas:100000000n,maxPriorityFeePerGas:1000000n};return {wallet,other,request};}
function journal(f,{populate=async r=>r,sign=r=>f.wallet.signTransaction(r),guard=null}={}){
 let pending=null,calls=0;return {get pending(){return pending;},get calls(){return calls;},run:()=>broadcastJournaled({wallet:{address:f.wallet.address,populateTransaction:populate,signTransaction:sign},request:f.request,label:'test',role:'operator',read:()=>pending,store:r=>pending=r,beforeBroadcast:guard,provider:{broadcastTransaction:async raw=>{calls++;return {hash:Transaction.from(raw).hash};}}})};
}
test('journal validates signed bytes and passes a frozen canonical transaction to final guards',async()=>{
 const f=fixture();let observed;const j=journal(f,{guard:r=>{observed=r;assert.ok(Object.isFrozen(r));assert.ok(Object.isFrozen(r.accessList));}});const result=await j.run();assert.equal(j.calls,1);assert.equal(j.pending.tx,result.hash);assert.equal(j.pending.from,f.wallet.address);assert.equal(j.pending.data,f.request.data);assert.equal(observed.chainId,84532n);assert.equal(observed.value,0n);
});
test('wallet preparation cannot change validated target, data, value, nonce, gas or fee fields before signing',async()=>{
 const f=fixture();for(const change of [{to:f.wallet.address},{data:'0x5678'},{value:1n},{nonce:5},{gasLimit:110000n},{maxFeePerGas:110000000n},{maxPriorityFeePerGas:2000000n}]){let signs=0;const j=journal(f,{populate:async r=>({...r,...change}),sign:async()=>{signs++;}});await assert.rejects(j.run(),/preparation changed/);assert.equal(signs,0);assert.equal(j.pending,null);assert.equal(j.calls,0);}
});
test('a signer returning different network, target, data, value, nonce, fee, type or sender cannot broadcast',async()=>{
 const f=fixture();for(const change of [{chainId:8453},{to:f.wallet.address},{data:'0x5678'},{value:1n},{nonce:5},{gasLimit:110000n},{maxFeePerGas:110000000n},{maxPriorityFeePerGas:2000000n}]){const j=journal(f,{sign:r=>f.wallet.signTransaction({...r,...change})});await assert.rejects(j.run(),/Signed bytes differ/);assert.equal(j.pending,null);assert.equal(j.calls,0);}
 const other=journal(f,{sign:r=>f.other.signTransaction(r)});await assert.rejects(other.run(),/Signed bytes differ/);assert.equal(other.pending,null);assert.equal(other.calls,0);
 const legacy=journal(f,{sign:r=>f.wallet.signTransaction({...r,type:0,maxFeePerGas:undefined,maxPriorityFeePerGas:undefined,gasPrice:100000000n})});await assert.rejects(legacy.run(),/Signed bytes differ/);assert.equal(legacy.calls,0);
});
test('post-sign preparation mutations cannot mislead guards or journal about actual signed bytes',async()=>{
 const f=fixture(),expected={...f.request};const j=journal(f,{sign:async r=>{const raw=await f.wallet.signTransaction(r);r.to=f.wallet.address;r.data='0x5678';r.nonce=44;return raw;},guard:r=>{assert.equal(r.to,expected.to);assert.equal(r.data,expected.data);assert.equal(r.nonce,expected.nonce);}});await j.run();assert.equal(j.pending.to,expected.to);assert.equal(j.pending.data,expected.data);assert.equal(j.pending.nonce,expected.nonce);
});
test('a final callback cannot mutate validated transaction fields or persist unsigned/invalid raw bytes',async()=>{
 const f=fixture(),mutating=journal(f,{guard:r=>{r.data='0x5678';}});await assert.rejects(mutating.run(),TypeError);assert.equal(mutating.pending,null);assert.equal(mutating.calls,0);
 const binding=bindPreparedTransaction(f.request,f.request,f.wallet.address);assert.throws(()=>verifySignedTransaction(Transaction.from(f.request).unsignedSerialized,binding),/Signed bytes differ/);
 const malformed=journal(f,{sign:async()=> '0x1234'});await assert.rejects(malformed.run());assert.equal(malformed.pending,null);assert.equal(malformed.calls,0);
});
test('source access lists are copied before async preparation and transaction fee/type limits fail closed',async()=>{
 const f=fixture();f.request.accessList=[{address:f.other.address,storageKeys:['0x'+'0'.repeat(64)]}];const changed=journal(f,{populate:async r=>{r.accessList[0].storageKeys[0]='0x'+'1'.repeat(64);return r;}});await assert.rejects(changed.run(),/preparation changed/);assert.equal(changed.calls,0);
 for(const change of [{gasLimit:6000001n},{maxFeePerGas:1000000001n},{maxPriorityFeePerGas:100000001n},{gasLimit:0n}]){const request={...fixture().request,...change};assert.throws(()=>bindPreparedTransaction(request,request,f.wallet.address),/limits invalid/);}
});
