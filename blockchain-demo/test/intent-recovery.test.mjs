import test from 'node:test';
import assert from 'node:assert/strict';
import {createIntentClient,withOperationLock} from '../public/intent-client.mjs';
import {runIdempotent} from '../src/idempotency.mjs';

function fixture(){
  const memory=new Map(),ledger={},bodies=[];let writes=0,loseReply=true;
  const storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
  const options={storage,csrf:()=> 'never-store-this-csrf',randomUUID:()=>crypto.randomUUID(),withLock:work=>work(),fetch:async(_url,request)=>{
    const input=JSON.parse(request.body);bodies.push(input);
    const result=await runIdempotent(ledger,input,async()=>({exchangeId:String(++writes)}),()=>{});
    if(loseReply){loseReply=false;throw new Error('socket closed after confirmed purchase');}
    return {ok:true,json:async()=>({ok:true,result})};
  }};
  return {options,memory,bodies,ledger,writes:()=>writes};
}
test('a confirmed purchase with a lost response survives reload and reuses the same key',async()=>{
  const f=fixture(),input={listingId:'sample-listing'};
  await assert.rejects(createIntentClient(f.options)('buy',input),/Ответ не получен/);
  assert.equal(f.writes(),1);
  assert(![...f.memory.values()].join('').includes('never-store-this-csrf'));
  const result=await createIntentClient(f.options)('buy',input);
  assert.equal(result.exchangeId,'1');assert.equal(result.idempotent,true);
  assert.equal(f.bodies[0].idempotencyKey,f.bodies[1].idempotencyKey);assert.equal(f.writes(),1);
});
test('HTTP errors and malformed success responses preserve the key across reload',async()=>{
  for(const response of [{ok:false,json:async()=>({error:'receipt verification unavailable'})},{ok:true,json:async()=>({ok:false})}]){
    const f=fixture();f.options.fetch=async(_url,request)=>{f.bodies.push(JSON.parse(request.body));return response;};
    await assert.rejects(createIntentClient(f.options)('buy',{listingId:'sample-listing'}));
    await assert.rejects(createIntentClient(f.options)('buy',{listingId:'sample-listing'}));
    assert.equal(f.bodies[0].idempotencyKey,f.bodies[1].idempotencyKey);
  }
});
test('corrupt or unavailable intent storage prevents any chain request',async()=>{
  for(const storage of [{getItem:()=>'{broken',setItem:()=>{}},{getItem:()=>null,setItem:()=>{throw new Error('storage denied');}}]){
    let posts=0;const f=fixture();f.options.storage=storage;f.options.fetch=async()=>{posts++;};
    await assert.rejects(createIntentClient(f.options)('buy',{listingId:'sample-listing'}));assert.equal(posts,0);
  }
});
test('an HTTP failure after an irreversible effect cannot create a second purchase',async()=>{
  const f=fixture();f.options.fetch=async(_url,request)=>{
    const input=JSON.parse(request.body);f.bodies.push(input);
    try{await runIdempotent(f.ledger,input,async()=>{f.ledger.effects=(f.ledger.effects||0)+1;throw new Error('post-receipt read failed');},()=>{});}
    catch(error){return {ok:false,json:async()=>({error:error.message})};}
  };
  await assert.rejects(createIntentClient(f.options)('buy',{listingId:'sample-listing'}));
  await assert.rejects(createIntentClient(f.options)('buy',{listingId:'sample-listing'}));
  assert.equal(f.ledger.effects,1);assert.equal(f.bodies[0].idempotencyKey,f.bodies[1].idempotencyKey);
});
test('a simultaneous second tab is refused instead of queuing an unintended new purchase',async()=>{
  const f=fixture();let held=false,release;
  const wait=new Promise(resolve=>release=resolve);
  const locks={request:async(_name,options,callback)=>{
    assert.equal(options.ifAvailable,true);
    if(held)return callback(null);
    held=true;try{return await callback({name:'aim-base-operation'});}finally{held=false;}
  }};
  f.options.withLock=work=>withOperationLock(locks,work);
  const fetch=f.options.fetch;f.options.fetch=async(...args)=>{await wait;return fetch(...args);};
  const first=createIntentClient(f.options)('buy',{listingId:'sample-listing'});
  await assert.rejects(createIntentClient(f.options)('buy',{listingId:'sample-listing'}),/Другая вкладка/);
  release();await assert.rejects(first,/Ответ не получен/);
  assert.equal(f.writes(),1);assert.equal(f.bodies.length,1);
});
