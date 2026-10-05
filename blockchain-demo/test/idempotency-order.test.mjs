import test from 'node:test';import assert from 'node:assert/strict';import {runIdempotent,requestMatches} from '../src/idempotency.mjs';
test('a confirmed retry with reordered JSON keeps its original digest and cannot perform a second write',async()=>{
 const store={},key='test-ordered-key-12345';let writes=0;const input={action:'list',kind:'video',assetId:'asset-video',price:'25',quantity:10,idempotencyKey:key};
 await runIdempotent(store,input,async()=>{writes++;return{offerId:'138'};},()=>{});const digest=store[key].digest;
 const reordered={idempotencyKey:key,quantity:10,price:'25',assetId:'asset-video',kind:'video',action:'list'};
 const retry=await runIdempotent(store,reordered,async()=>{writes++;return{offerId:'139'};},()=>{});assert.equal(retry.offerId,'138');assert.equal(retry.idempotent,true);assert.equal(writes,1);assert.equal(store[key].digest,digest);
 await assert.rejects(runIdempotent(store,{...reordered,price:'26'},async()=>{},()=>{}),/different parameters/);
 assert.equal(requestMatches({...store[key],input:{...input,quantity:9}},reordered),false,'reordered comparison must verify the stored input digest');
});
test('reordered retries cannot turn a failed or pending intent into an automatic broadcast',async()=>{
 const store={},input={action:'buy',listingId:'listing-demo',idempotencyKey:'test-failed-key-12345'};let writes=0;
 await assert.rejects(runIdempotent(store,input,async()=>{writes++;throw Error('Insufficient gas');},()=>{}),/Insufficient gas/);
 await assert.rejects(runIdempotent(store,{idempotencyKey:input.idempotencyKey,listingId:input.listingId,action:input.action},async()=>{writes++;return{};},()=>{}),/Prior operation failed/);assert.equal(writes,1);
});
