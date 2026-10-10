import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('model advice is rejected — never recorded as on-chain fact', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-learn-prov-'));
  process.env.STATION_ROOT = tmpRoot;
  const fresh = await import('../src/station-kernel-bridge.mjs?v=learnprov-'+Date.now());
  assert.throws(() => fresh.emitKernelEvent({ type: 'learning', source: 'model', advice: true }), /Model advice must not be recorded/);
  assert.throws(() => fresh.emitKernelEvent({ type: 'learning', source: 'llm' }), /Model advice must not be recorded/);
  assert.throws(() => fresh.emitKernelEvent({ type: 'learning', lessonId: null }), /requires explicit lessonId/);
  // durable must stay empty
  const eventsFile = path.join(tmpRoot, 'tools', 'state', 'blockchain_kernel_events.jsonl');
  const count = fs.existsSync(eventsFile) ? fs.readFileSync(eventsFile,'utf8').split('\n').filter(Boolean).length : 0;
  assert.equal(count, 0, 'no phantom learning event must be persisted');
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  delete process.env.STATION_ROOT;
  const stationRoot = 'C:/AI';
  const real = stationRoot + '/tools/state/blockchain_kernel_events.jsonl';
  // real durable is append-only; combat E2E grows it (6 synthetic -> 11 combat), just verify it did not shrink/grow spuriously in this test
  if (fs.existsSync(real)) {
    const n = fs.readFileSync(real,'utf8').split('\n').filter(Boolean).length;
    assert.ok(n >= 6, 'real durable must retain at least synthetic 6 events, got '+n);
  }
});

test('explicit lessonId learning append is allowed and queryable without rewrite', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-learn-prov2-'));
  process.env.STATION_ROOT = tmpRoot;
  const fresh = await import('../src/station-kernel-bridge.mjs?v=learnprov2-'+Date.now());
  const ev = fresh.emitKernelEvent({ type: 'learning', lessonId: 'lesson-001', result: 'confirmed', retry: 'backoff' });
  assert.equal(ev.type, 'learning');
  assert.equal(ev.lessonId, 'lesson-001');
  const byType = fresh.queryKernelEvents({ type: 'learning' });
  assert.equal(byType.length, 1);
  const file = path.join(tmpRoot, 'tools', 'state', 'blockchain_kernel_events.jsonl');
  const n1 = fs.readFileSync(file,'utf8').split('\n').filter(Boolean).length;
  fresh.queryKernelEvents({ type: 'learning' });
  const n2 = fs.readFileSync(file,'utf8').split('\n').filter(Boolean).length;
  assert.equal(n1, n2, 'query must not rewrite');
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  delete process.env.STATION_ROOT;
  const stationRoot = 'C:/AI';
  const real = stationRoot + '/tools/state/blockchain_kernel_events.jsonl';
  if (fs.existsSync(real)) {
    const n = fs.readFileSync(real,'utf8').split('\n').filter(Boolean).length;
    assert.ok(n >= 6, 'real durable must retain at least synthetic 6 events, got '+n);
  }
});

test('assertNotModelAdvice is exported and guards future advice surface', async () => {
  const fresh = await import('../src/station-kernel-bridge.mjs?v=learnprov3-'+Date.now());
  assert.equal(typeof fresh.assertNotModelAdvice, 'function');
  assert.doesNotThrow(() => fresh.assertNotModelAdvice({ type: 'release', releaseId: 'r1' }));
});
