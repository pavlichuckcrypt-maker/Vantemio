import test from 'node:test';import assert from 'node:assert/strict';import {Wallet} from 'ethers';
import {createProofStore} from './wallet-proof.mjs';
test('proof binds origin, address and Base Sepolia, and cannot replay',async()=>{
  const a=Wallet.createRandom(),s=createProofStore({origin:'http://127.0.0.1:18340'}),c=s.issue(a.address,84532);
  assert.match(c.message,/Origin: http:\/\/127.0.0.1:18340/);assert.match(c.message,/does not authorize/);
  assert.equal(s.verify(c.id,await a.signMessage(c.message)).account,a.address);
  assert.throws(()=>s.verify(c.id,'0x'),/already used/);assert.throws(()=>s.issue(a.address,8453),/Sepolia/);
});
test('wrong signer consumes challenge; expired challenges fail; capacity is bounded',async()=>{
  let time=0;const a=Wallet.createRandom(),b=Wallet.createRandom(),s=createProofStore({origin:'local',now:()=>time,limit:1,ttl:10});
  let c=s.issue(a.address,84532);assert.throws(()=>s.issue(b.address,84532),/Too many/);
  assert.throws(()=>s.verify(c.id,b.signingKey.sign('0x'+'11'.repeat(32)).serialized),/mismatch/);
  assert.throws(()=>s.verify(c.id,'0x'),/already used/);c=s.issue(a.address,84532);time=11;
  assert.throws(()=>s.verify(c.id,'0x'),/expired/);s.issue(a.address,84532);
});
