import test from 'node:test';import assert from 'node:assert/strict';
import {assertWalletTransaction,assertWalletEntitlement,walletGasLimit} from './wallet-market.mjs';
const a='0x'+'12'.repeat(20),b='0x'+'34'.repeat(20);
test('gas ceiling includes the safety margin',()=>{
  assert.equal(walletGasLimit(100000n),130000n);
  assert.equal(walletGasLimit(2075000n),2500000n);
  assert.throws(()=>walletGasLimit(2075001n),/limit exceeded/);
});
test('external wallet receipt requires exact sender, chain, target, data, zero value and nonce',()=>{
  const i={account:a,tx:{to:b,data:'0x1234',nonce:'0x2',gas:'0x20000'}},tx={chainId:84532n,from:a,to:b,data:'0x1234',value:0n,nonce:2,gasLimit:100000n};
  assert.doesNotThrow(()=>assertWalletTransaction(tx,i));
  for(const patch of [{chainId:8453n},{from:b},{to:a},{data:'0xabcd'},{value:1n},{nonce:3},{gasLimit:131073n},{gasLimit:0n}])assert.throws(()=>assertWalletTransaction({...tx,...patch},i),/differs/);
});
test('external delivery rejects other buyer, offer and unredeemed order',()=>{
  const e={exists:true,exchange:{offerId:136n,buyerId:2n,state:3n}},buyer={exists:true,buyer:{wallet:a}},o={buyerId:'2'},l={offerId:'136'};
  assert.doesNotThrow(()=>assertWalletEntitlement(e,buyer,o,l,a));
  assert.throws(()=>assertWalletEntitlement(e,buyer,o,l,b),/mismatch/);
  for(const patch of [{state:0n},{state:2n},{offerId:137n},{buyerId:3n}])assert.throws(()=>assertWalletEntitlement({...e,exchange:{...e.exchange,...patch}},buyer,o,l,a),/mismatch/);
});
test('nonce comparison remains exact above the JavaScript safe integer range',()=>{const nonce=9007199254740992n,i={account:a,tx:{to:b,data:'0x1234',nonce:'0x'+nonce.toString(16),gas:'0x20000'}},tx={chainId:84532n,from:a,to:b,data:'0x1234',value:0n,nonce,gasLimit:100000n};assert.doesNotThrow(()=>assertWalletTransaction(tx,i));assert.throws(()=>assertWalletTransaction({...tx,nonce:nonce+1n},i),/differs/);});

test('approval retirement requires expired approval, exact bindings, two canonical confirmed nonce and allowance views',async()=>{
  const {assertApprovalRetirement}=await import('./wallet-market.mjs');
  const intent={action:'approve',status:'PREPARED',expires:100,account:a,tx:{to:b,data:'0x1234',value:'0x0',chainId:'0x14a34',nonce:'0x0'}};
  const v={chainId:84532,block:100,latestBlock:102,blockHash:'0x'+'ab'.repeat(32),nonce:3,allowance:25000000000000000000n},options={now:101,price:'25',data:'0x1234',to:b};
  assert.equal(assertApprovalRetirement(intent,[v,{...v}],options).block,100);
  for(const patch of [{action:'commit'},{action:'redeem'},{action:'complete'},{status:'SUBMITTED'},{status:'CONFIRMED'},{hash:'0x'+'aa'.repeat(32)},{expires:102}])assert.throws(()=>assertApprovalRetirement({...intent,...patch},[v,v],options));
  for(const patch of [{chainId:8453},{block:101},{block:NaN},{latestBlock:101},{latestBlock:NaN},{blockHash:'0x'+'cd'.repeat(32)},{nonce:0},{allowance:24000000000000000000n},{allowance:26000000000000000000n}])assert.throws(()=>assertApprovalRetirement(intent,[v,{...v,...patch}],options));
  for(const patch of [{to:a},{data:'0xabcd'},{value:'0x1'},{chainId:'0x2105'}])assert.throws(()=>assertApprovalRetirement({...intent,tx:{...intent.tx,...patch}},[v,v],options));
  assert.throws(()=>assertApprovalRetirement(intent,[v],options));
});
