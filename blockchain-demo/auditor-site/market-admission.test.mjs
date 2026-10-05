import test from 'node:test';
import assert from 'node:assert/strict';
import {createMarketAdmission} from './market-admission.mjs';
const address=i=>'0x'+i.toString(16).padStart(40,'0');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const turn=()=>new Promise(r=>setImmediate(r));

test('purchase requests wait in order; reads cannot occupy checkout capacity',async()=>{
 const q=createMarketAdmission({limits:{checkout:2,read:1,queuedPerLane:4,waitMs:1000}}),hold=deferred(),started=[];
 const requests=[1,2,3,4].map(i=>q.run('checkout',address(i),async()=>{started.push(i);await hold.promise;return i;}));
 await turn();assert.deepEqual(started,[1,2]);assert.deepEqual(q.snapshot().checkout,{active:2,queued:2});
 assert.equal(await q.run('read',address(1),()=>42),42);
 await assert.rejects(q.run('checkout',address(3),()=>{}),e=>e.status===409);
 hold.resolve();assert.deepEqual(await Promise.all(requests),[1,2,3,4]);await turn();assert.deepEqual(started,[1,2,3,4]);assert.equal(q.snapshot().checkout.active,0);
});

test('full and expired queues fail without running the purchase; capacity recovers after failure',async()=>{
 const q=createMarketAdmission({limits:{checkout:1,read:1,queuedPerLane:1,waitMs:30}}),hold=deferred();let invoked=false;
 const first=q.run('checkout',address(1),()=>hold.promise);await turn();
 const pending=q.run('checkout',address(2),()=>{invoked=true;});const expired=assert.rejects(pending,e=>e.status===503);
 await assert.rejects(q.run('checkout',address(3),()=>{}),e=>e.status===503);await expired;assert.equal(invoked,false);
 hold.resolve();await first;await turn();await assert.rejects(q.run('checkout',address(2),()=>{throw new Error('RPC outage');}),/RPC outage/);await turn();
 assert.equal(await q.run('checkout',address(2),()=>7),7);
});

test('disconnect removes queued work and does not execute it later',async()=>{
 const q=createMarketAdmission({limits:{checkout:1,read:1,queuedPerLane:2,waitMs:1000}}),hold=deferred(),abort=new AbortController();let invoked=false;
 const first=q.run('checkout',address(1),()=>hold.promise);await turn();
 const pending=q.run('checkout',address(2),()=>{invoked=true;},{signal:abort.signal});const rejected=assert.rejects(pending,e=>e.status===499);abort.abort();await rejected;
 assert.equal(q.snapshot().checkout.queued,0);hold.resolve();await first;await turn();assert.equal(invoked,false);
 assert.equal(await q.run('checkout',address(2),()=>9),9);
});
