import test from 'node:test';
import assert from 'node:assert/strict';
import { CHECKS, evaluate, enforce } from '../src/security.mjs';

test('all 15 verified checks permit execution',()=>{
  const proof=Object.fromEntries(CHECKS.map(([id])=>[id,true]));
  assert.doesNotThrow(()=>enforce(evaluate(proof)));
});
for(const [id] of CHECKS)test(`missing or failed ${id} blocks execution`,()=>{
  for(const value of [undefined,false,'true',1]){
    const proof=Object.fromEntries(CHECKS.map(([key])=>[key,true]));proof[id]=value;
    assert.throws(()=>enforce(evaluate(proof)),/Security checks failed/);
  }
});
test('reordered, truncated and duplicated check packets are rejected',()=>{
  const checks=evaluate(Object.fromEntries(CHECKS.map(([key])=>[key,true])));
  assert.throws(()=>enforce(checks.slice(1)));
  assert.throws(()=>enforce([...checks].reverse()));
  assert.throws(()=>enforce([...checks.slice(0,14),checks[0]]));
});
