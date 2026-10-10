import test from 'node:test';
import assert from 'node:assert/strict';
import { runIdempotent } from '../src/idempotency.mjs';
import { broadcastJournaled } from '../src/public-journal.mjs';
import { Wallet, keccak256 } from 'ethers';

// Invariant from BLOCKCHAIN_PUBLIC_TESTNET_TASK_20261005_RU.md §2/4:
// "Не освобождать claims только из-за устаревшего heartbeat." —
// an expired heartbeat / stale timestamp must NOT auto-release a pending
// claim nor authorize replay; reconcile actual work first.
// Legacy provenance: historic `legacy-service` listing stays routable.

test('pending claim survives stale heartbeat — no auto-release or replay', async () => {
  // Pending path: store entry with old timestamp must still block replay
  const key = 'heartbeat-claim-key-12345678';
  const input = { action: 'buy', listingId: 'sample-listing', idempotencyKey: key };
  const pendingStore = {};
  pendingStore[key] = { digest: '0x' + 'a'.repeat(64), input: structuredClone(input), status: 'pending', at: new Date(Date.now() - 24 * 3600 * 1000).toISOString() };
  // Provide correct digest so requestMatches passes, then status check blocks
  const { hash } = await import('../src/chain.mjs');
  pendingStore[key].digest = hash(JSON.stringify(input));
  pendingStore[key].input = structuredClone(input);
  await assert.rejects(runIdempotent(pendingStore, input, async () => ({}), () => {}), /Prior operation pending/);
  // Even with reordered JSON, same digest must still be considered pending
  await assert.rejects(runIdempotent(pendingStore, { idempotencyKey: key, listingId: input.listingId, action: input.action }, async () => ({}), () => {}), /Prior operation pending/);
});

test('public journal pending blocks second broadcast even after heartbeat age', async () => {
  const wallet = Wallet.createRandom();
  const request = { chainId: 84532, nonce: 0, to: wallet.address, data: '0x', value: 0n, type: 2, gasLimit: 21000n, maxFeePerGas: 100000000n, maxPriorityFeePerGas: 1000000n };
  const signer = { address: wallet.address, populateTransaction: async r => r, signTransaction: r => wallet.signTransaction(r) };
  let pending = null;
  const args = {
    wallet: signer, request, label: 'test', role: 'operator',
    read: () => pending,
    store: p => { pending = p; pending.at = new Date(Date.now() - 3600 * 1000).toISOString(); },
    provider: { broadcastTransaction: async raw => { throw new Error('RPC timeout'); } }
  };
  const raw = await signer.signTransaction(request);
  pending = { schemaVersion: 1, chainId: 84532, tx: keccak256(raw), label: 'test', role: 'operator', from: wallet.address, nonce: 0, to: wallet.address, data: '0x', value: '0', at: new Date(Date.now() - 3600 * 1000).toISOString(), status: 'broadcast-uncertain' };
  await assert.rejects(broadcastJournaled({ ...args, read: () => pending }), /Unreconciled/);
});

test('legacy-service provenance remains routable via existing listing', async () => {
  const { assertOfferMetadata } = await import('../src/offer-metadata.mjs');
  const listing = { id: 'legacy-service', offerId: '131', kind: 'service', price: '25', title: 'Монтаж видео · исходное демо', description: 'Готовое тестовое предложение монтажной студии.', terms: 'Testnet demonstration service only.', assetId: null, assetSha256: null, certificate: null, metadataHash: '' };
  // legacy-service with correct metadata must validate via legacyOfferId
  assert.doesNotThrow(() => assertOfferMetadata(listing, { metadataHash: '', metadataUri: 'data:application/json;base64,' + Buffer.from(JSON.stringify({ name: 'Video editing / accepted final cut', description: 'Testnet demo service; no monetary value', testOnly: true })).toString('base64') }, { legacyOfferId: '131' }));
});
