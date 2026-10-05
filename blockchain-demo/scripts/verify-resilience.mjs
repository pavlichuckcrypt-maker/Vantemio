// Replays a previously confirmed request only. This script creates no chain writes.
import fs from 'node:fs';
import path from 'node:path';
import {createIntentClient} from '../public/intent-client.mjs';
import {ROOT} from '../src/compile.mjs';
import {load,json,hash} from '../src/chain.mjs';
if(process.env.AIM_DEMO_NETWORK!=='base-sepolia')throw new Error('Explicit Base Sepolia profile required');
const origin='http://127.0.0.1:18339';
const initial=await(await fetch(origin+'/api/state')).json();
if(initial.active||initial.pendingTransaction||!initial.chainView?.verified)throw new Error('Defer resilience check: active/pending/unverified state');
const market=load('marketplace.json');let existing=null;
for(const [key,record]of Object.entries(market.requests)){
  if(record.status!=='confirmed'||!record.result?.listingId||!record.result?.exchangeId)continue;
  const input={action:'buy',listingId:record.result.listingId,idempotencyKey:key};
  if(hash(JSON.stringify(input))===record.digest){existing=input;break;}
}
if(!existing)throw new Error('No compatible confirmed UI purchase for a write-free replay');
const memory=new Map(),bodies=[];let loseReply=true;
const options={storage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)},
  csrf:()=>initial.csrf,randomUUID:()=>existing.idempotencyKey,withLock:work=>work(),
  fetch:async(url,request)=>{
    bodies.push(JSON.parse(request.body));
    const response=await fetch(origin+url,{...request,headers:{...request.headers,Origin:origin},signal:AbortSignal.timeout(15000)});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error);
    if(loseReply){loseReply=false;throw new Error('Injected loss after a real confirmed replay response');}
    return {ok:true,json:async()=>data};
  }};
let lost=false;
try{await createIntentClient(options)('buy',{listingId:existing.listingId});}catch{lost=true;}
if(!lost)throw new Error('Loss injection did not execute');
const recovered=await createIntentClient(options)('buy',{listingId:existing.listingId});
const final=await(await fetch(origin+'/api/evidence')).json();
if(!recovered.idempotent||bodies.length!==2||bodies[0].idempotencyKey!==bodies[1].idempotencyKey||final.receipts.length!==initial.receipts.length||final.orders.length!==initial.orders.length)throw new Error('Confirmed replay did not preserve exactly-once effects');
const response=await fetch(origin+'/intent-client.mjs');if(!response.ok||!(await response.text()).includes('createIntentClient'))throw new Error('Browser module is not served');
const report={checkedAt:new Date().toISOString(),chainId:84532,passed:true,chainWritesCreated:0,
  confirmedExchangeReplayed:recovered.exchangeId,receiptCountBefore:initial.receipts.length,receiptCountAfter:final.receipts.length,
  checks:['lost HTTP response + reconstructed browser client reused the same intent','confirmed Boson purchase returned idempotent result','order and receipt counts unchanged','live chain projection verified NFT ownership/order states/offer availability at one block','browser retry module served'],
  localFailureInjection:'HTTP errors, post-receipt exceptions, unavailable storage, external NFT transfer, depleted offer, changed terms and reorg covered by local tests'};
fs.writeFileSync(path.join(ROOT,'evidence/RESILIENCE_VERIFICATION.json'),json(report)+'\n');console.log(json(report));
