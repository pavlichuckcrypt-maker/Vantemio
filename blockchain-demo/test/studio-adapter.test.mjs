import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../src/compile.mjs';
import path from 'node:path';
test('studio acceptance adapter rejects stale, incomplete and escaped inputs',()=>{
  const result=spawnSync('python3',[path.join(ROOT,'test','studio_adapter_cases.py')],{encoding:'utf8',timeout:15000});
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
});
test('public studio hook rejects mainnet, changed acceptance and false success',()=>{
  const result=spawnSync('python3',[path.join(ROOT,'test','studio_publish_cases.py')],{encoding:'utf8',timeout:15000});
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
});
