import {registeredSafeOwnersMatch} from '../src/approval-authority.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Wallet } from 'ethers';
import { COMMERCE_POLICY,verifyQuorum } from '../src/commerce-policy.mjs';
import { validateMarketAction } from '../src/market-schema.mjs';
import { runIdempotent } from '../src/idempotency.mjs';
import { assertEntitlement,createDeliveryVault } from '../src/delivery.mjs';

test('market schema rejects injected actor/chain/path, impossible prices and missing assets',()=>{
  const base={action:'list',idempotencyKey:'test-request-key-0123456',kind:'service',title:'Video edit',description:'Test editing service',price:'25',quantity:10};
  assert.equal(validateMarketAction(base),base);
  for(const changed of [{chainId:8453},{role:'seller'},{file:'/etc/passwd'},{price:'1e9'},{price:'-1'},{price:'1001'},{quantity:0},{quantity:1.5},{kind:'video'},{kind:'unknown'},{assetId:'../secret'}])assert.throws(()=>validateMarketAction({...base,...changed}));
  assert.throws(()=>validateMarketAction({action:'__proto__',idempotencyKey:'test-request-key-0123456'}));
});
test('idempotency prevents duplicate effects, parameter substitution and uncertain retries',async()=>{
  const store={};let writes=0;const input={action:'buy',idempotencyKey:'same-key-123456789',listingId:'sample-listing'};
  const work=async()=>({exchangeId:String(++writes)});const a=await runIdempotent(store,input,work,()=>{}),b=await runIdempotent(store,input,work,()=>{});
  assert.equal(a.exchangeId,b.exchangeId);assert.equal(writes,1);assert.equal(b.idempotent,true);
  await assert.rejects(()=>runIdempotent(store,{...input,listingId:'other-listing'},work,()=>{}),/different/);
  store.pending={digest:'anything',status:'pending'};
  const bad={...input,idempotencyKey:'failed-key-1234567'};
  await assert.rejects(()=>runIdempotent(store,bad,async()=>{throw new Error('RPC ambiguous');},()=>{}));
  await assert.rejects(()=>runIdempotent(store,bad,work,()=>{}),/failed/);assert.equal(writes,1);
});
test('commerce quorum binds target, actor, calldata, nonce and expiry; duplicates do not count',async()=>{
  const wallets=Array.from({length:5},()=>Wallet.createRandom());const owners=wallets.map(w=>w.address);
  const domain={name:'AIMmontag Demo Commerce',version:'3',chainId:84532,verifyingContract:owners[4]};
  const message={policy:COMMERCE_POLICY,action:'boson-commit',actor:owners[3],dataHash:'0x'+'1'.repeat(64),implementationDigest:'0x'+'a'.repeat(64),nonce:4,expiresAt:1060};
  const types={Operation:[{name:'policy',type:'string'},{name:'action',type:'string'},{name:'actor',type:'address'},{name:'dataHash',type:'bytes32'},{name:'implementationDigest',type:'bytes32'},{name:'nonce',type:'uint256'},{name:'expiresAt',type:'uint256'}]};
  const approvals=await Promise.all(wallets.slice(0,3).map(async w=>({address:w.address,signature:await w.signTypedData(domain,types,message)})));
  assert.match(verifyQuorum(domain,message,approvals,owners,1000,message.implementationDigest),/^0x/);
  for(const change of [{actor:owners[0]},{nonce:5},{dataHash:'0x'+'2'.repeat(64)},{implementationDigest:'0x'+'b'.repeat(64)},{expiresAt:1000}])assert.throws(()=>verifyQuorum(domain,{...message,...change},approvals,owners,1000,message.implementationDigest));
  for(const change of [{chainId:8453},{verifyingContract:owners[0]},{version:'2'},{name:'Foreign app'}])assert.throws(()=>verifyQuorum({...domain,...change},message,approvals,owners,1000,message.implementationDigest));
  assert.throws(()=>verifyQuorum(domain,message,approvals.slice(0,2),owners,1000,message.implementationDigest));
  assert.throws(()=>verifyQuorum(domain,message,[approvals[0],approvals[0],approvals[1]],owners,1000,message.implementationDigest));
});
test('delivery denies unpaid, cancelled, disputed, wrong-buyer and mismatched-offer exchanges',()=>{
  const address='0x'+'1'.repeat(40),order={buyerId:'2'},listing={offerId:'3',kind:'video',assetId:'demo-asset'};
  const exchange={exists:true,exchange:{offerId:3n,buyerId:2n,state:3}},buyer={exists:true,buyer:{wallet:address}};
  assert.doesNotThrow(()=>assertEntitlement(exchange,buyer,order,listing,address));
  for(const state of [0,1,2,5])assert.throws(()=>assertEntitlement({...exchange,exchange:{...exchange.exchange,state}},buyer,order,listing,address));
  assert.throws(()=>assertEntitlement(exchange,buyer,order,{...listing,offerId:'4'},address));
  assert.throws(()=>assertEntitlement(exchange,buyer,order,listing,'0x'+'2'.repeat(40)));
  assert.throws(()=>assertEntitlement(exchange,{exists:false},order,listing,address));
});
test('delivery capabilities are one-use, expiring and isolated across vaults/restarts',()=>{
  const vault=createDeliveryVault(),binding={exchangeId:'3',assetId:'demo-asset',sha256:'1'.repeat(64)};
  const g=vault.issue(binding,1000);assert.equal(vault.consume(g.token,2000).assetId,binding.assetId);
  assert.throws(()=>vault.consume(g.token,2001),/used/);
  const expired=vault.issue(binding,1000);assert.throws(()=>vault.consume(expired.token,61000),/Expired/);
  const restart=vault.issue(binding,1000);assert.throws(()=>createDeliveryVault().consume(restart.token,2000));
});

 test('unchanged 3-of-5 threshold cannot hide signer replacement, missing owners or duplicates',()=>{
  const owners=Array.from({length:5},(_,i)=>'0x'+(i+1).toString(16).padStart(40,'0'));
  assert.equal(registeredSafeOwnersMatch([...owners].reverse(),owners,3n),true);
  const changed=[...owners];changed[4]='0x'+('ff'.repeat(20));
  assert.equal(registeredSafeOwnersMatch(changed,owners,3),false);
  assert.equal(registeredSafeOwnersMatch(owners,owners,2),false);
  assert.equal(registeredSafeOwnersMatch(owners.slice(0,3),owners,3),false);
  assert.equal(registeredSafeOwnersMatch([owners[0],owners[0],...owners.slice(2)],owners,3),false);
  assert.equal(registeredSafeOwnersMatch(owners,undefined,3),false);
 });
