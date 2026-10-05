import test from 'node:test';
import assert from 'node:assert/strict';
import { assertBase } from '../src/base-chain.mjs';
test('Base public profile refuses local chains and mainnet before signing',async()=>{
  for(const id of [56,97,8453,31337,1])await assert.rejects(()=>assertBase({send:async()=>id}));
  assert.equal(await assertBase({send:async()=>84532}),true);
});
