import test from 'node:test';
import assert from 'node:assert/strict';
import { assertBsc } from '../src/bsc-chain.mjs';
test('BSC public profile refuses local chains and mainnet before signing',async()=>{
  for(const id of [56,31337,84532,1])await assert.rejects(()=>assertBsc({send:async()=>id}));
  assert.equal(await assertBsc({send:async()=>97}),true);
});
