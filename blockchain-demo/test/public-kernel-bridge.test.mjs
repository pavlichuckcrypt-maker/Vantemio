import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('public bridge requires explicit target; isolated event consumer preserves history', async () => {
  delete process.env.STATION_ROOT;
  const disabled = await import('../src/station-kernel-bridge.mjs?disabled');
  assert.equal(disabled.emitKernelEvent({type:'test'}).recorded,false);
  assert.deepEqual(disabled.queryKernelEvents(),[]);
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'vantemio-bridge-'));
  try {
    process.env.STATION_ROOT=root;
    const bridge=await import('../src/station-kernel-bridge.mjs?isolated');
    bridge.emitReleaseKernelEvent({releaseId:'fixture-release',videoHash:'a'.repeat(64),owner:'fixture',tokenId:'1',idempotent:true});
    const file=path.join(root,'tools/state/blockchain_kernel_events.jsonl');
    const before=fs.readFileSync(file,'utf8');
    assert.equal(bridge.queryKernelEvents({releaseId:'fixture-release'}).length,1);
    assert.equal(fs.readFileSync(file,'utf8'),before);
    assert.throws(()=>bridge.emitKernelEvent({type:'release',source:'model'}));
    assert.equal(fs.readFileSync(file,'utf8'),before);
    const recovered=await import('../src/station-kernel-bridge.mjs?recovered');
    assert.equal(recovered.queryKernelEvents({releaseId:'fixture-release'}).length,1);
    assert.equal(fs.readFileSync(file,'utf8'),before);
  } finally { delete process.env.STATION_ROOT; fs.rmSync(root,{recursive:true,force:true}); }
});
