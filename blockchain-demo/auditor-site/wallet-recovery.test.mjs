import test from 'node:test';import assert from 'node:assert/strict';
import {reconcileWithRetry} from './public/wallet-recovery.mjs';
const body={id:'owned-intent',hash:'0x'+'ab'.repeat(32)};
test('receipt recovery retries only the same frozen intent and hash with bounded reads',async()=>{
  const calls=[],delays=[];const result=await reconcileWithRetry(async input=>{calls.push(input);assert.ok(Object.isFrozen(input));if(calls.length<3)throw Error('Three confirmations required; reconcile the same intent again');return {...input,status:'CONFIRMED'};},body,{wait:async ms=>delays.push(ms)});
  assert.equal(result.status,'CONFIRMED');assert.equal(calls.length,3);assert.ok(calls.every(input=>input===calls[0]));assert.deepEqual(delays,[2000,2000]);
  let count=0;await assert.rejects(reconcileWithRetry(async()=>{count++;throw Error('Wallet transaction is pending');},body,{wait:async()=>{}}),/pending/);assert.equal(count,5);
});
test('recovery fails closed on auth, foreign transactions, RPC contents, wrong responses and invalid identity',async()=>{
  for(const message of ['Wallet ownership signature required','Wallet transaction differs from prepared testnet intent','RPC receipt content mismatch']){let count=0;await assert.rejects(reconcileWithRetry(async()=>{count++;throw Error(message);},body,{wait:async()=>{throw Error('must not retry');}}),new RegExp(message));assert.equal(count,1);}
  for(const patch of [{id:'other'},{hash:'0x'+'cd'.repeat(32)},{status:'SUBMITTED'}])await assert.rejects(reconcileWithRetry(async()=>({...body,status:'CONFIRMED',...patch}),body),/identity mismatch/);
  await assert.rejects(reconcileWithRetry(async()=>{throw Error('must not call');},{...body,hash:'invalid'}),/Invalid/);
});

test('ledger refresh releases terminal recovery state and keeps locally observed broadcast hashes',async()=>{
 const {mergeRecoveryIntent}=await import('./public/wallet-recovery.mjs');const account='0x'+'12'.repeat(20),key='durable-key',hash=body.hash,input={key,action:'commit'};
 const local={account,key,id:'intent-1',status:'SUBMITTED',hash,sendStarted:true,input},server={account,key,id:'intent-1',status:'PREPARED'};
 const recovery=mergeRecoveryIntent(local,[server],account);assert.equal(recovery.hash,hash);assert.equal(recovery.status,'SUBMITTED');assert.equal(recovery.sendStarted,true);assert.equal(recovery.input,input);
 for(const status of ['CONFIRMED','REVERTED','SUPERSEDED'])assert.equal(mergeRecoveryIntent(local,[{...server,status,hash}],account).status,status);
 assert.equal(mergeRecoveryIntent({...local,hash:undefined},[{...server,status:'CANCELLED'}],account).status,'CANCELLED');
 assert.equal(mergeRecoveryIntent(local,[],account),local,'a missing page entry is not proof that a broadcast failed');
});

test('recovery binds owner, intent identity and hash; conflicting active intents fail closed',async()=>{
 const {mergeRecoveryIntent}=await import('./public/wallet-recovery.mjs');const account='0x'+'12'.repeat(20),other='0x'+'34'.repeat(20),i={account,key:'same-key',id:'intent-1',status:'SUBMITTED',hash:body.hash};
 for(const patch of [{account:other},{id:'intent-2'},{hash:'0x'+'cd'.repeat(32)},{status:'UNVERIFIED'}])assert.throws(()=>mergeRecoveryIntent(i,[{...i,...patch}],account));
 assert.throws(()=>mergeRecoveryIntent(i,[{...i,status:'CANCELLED'}],account),/observed transaction/);
 assert.throws(()=>mergeRecoveryIntent(i,[{...i,status:'CONFIRMED',hash:undefined}],account),/Missing recovery/);
 assert.throws(()=>mergeRecoveryIntent(i,[{...i,hash:'invalid'}],account),/Invalid recovery transaction/);
 assert.throws(()=>mergeRecoveryIntent({...i,account:other},[i],account));assert.throws(()=>mergeRecoveryIntent(i,[i,{...i,key:'other-key',id:'other'}],account),/Multiple active/);
});

test('only a matching locally unsent preparation may retain the option to request a wallet signature',async()=>{
 const {mergeRecoveryIntent}=await import('./public/wallet-recovery.mjs');const account='0x'+'12'.repeat(20),i={account,key:'key-a',id:'a',status:'PREPARED'};
 assert.equal(mergeRecoveryIntent({...i,sendStarted:false},[i],account).sendStarted,false);
 assert.equal(mergeRecoveryIntent(null,[i],account).sendStarted,true);
 assert.equal(mergeRecoveryIntent({...i,key:'old',sendStarted:false},[i],account).sendStarted,true);
 assert.equal(mergeRecoveryIntent({...i,sendStarted:false},[{...i,status:'SUBMITTED',hash:body.hash}],account).sendStarted,true);
});
