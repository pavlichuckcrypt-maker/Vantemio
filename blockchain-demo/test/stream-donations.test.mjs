import test from 'node:test';
import assert from 'node:assert/strict';
import { Interface } from 'ethers';
import { prepareDonationIntent, verifyDonationReceipt, DONATION_USDC, donationAmount, PLATFORM_FEE_BPS } from '../src/stream-donations.mjs';

const donor = '0x1111111111111111111111111111111111111111';
const recipient = '0x2222222222222222222222222222222222222222';
const txHash = '0x' + 'a'.repeat(64), blockHash = '0x' + 'b'.repeat(64);
const abi = new Interface(['event Transfer(address indexed from,address indexed to,uint256 value)']);
const intent = (asset = 'USDC') => prepareDonationIntent({ requestIdentity: 'original-donation-1', creator: { id: 'streamer-1', version: 3, wallet: recipient }, donor, asset, amount: '1.5', nonce: 7 });
function views(i) {
  const tx = { ...i.tx, value: BigInt(i.tx.value), hash: txHash, blockNumber: 100, blockHash };
  const encoded = abi.encodeEventLog('Transfer', [donor, recipient, BigInt(i.amountUnits)]);
  const log = { address: DONATION_USDC, ...encoded, index: 2, transactionHash: txHash, blockHash, removed: false };
  const receipt = { hash: txHash, blockNumber: 100, blockHash, index: 0, status: 1, gasUsed: 21000n, cumulativeGasUsed: 21000n, logs: i.asset === 'USDC' ? [log] : [] };
  return [0, 1].map(() => structuredClone({ tx, receipt, canonicalBlockHash: blockHash, latestBlock: 102 }));
}
for (const asset of ['USDC', 'ETH']) test(`${asset} direct transfer and original identity`, () => {
  const i = intent(asset), proof = verifyDonationReceipt(i, views(i), txHash);
  assert.equal(proof.recipient, recipient); assert.equal(proof.originalRequestIdentity, 'original-donation-1');
  assert.equal(proof.state, 'verified-awaiting-durable-consumer'); assert.equal(proof.transactionClaimKey, `84532:${txHash}`);
  assert.equal(proof.testnet, true); assert.equal(proof.platformFeeBps, 100);
});
test('canonical decimal precision; no rounding', () => {
  assert.equal(donationAmount('0.000001', 'USDC'), 1n);
  assert.equal(donationAmount('0.000000000000000001', 'ETH'), 1n);
  for (const a of ['0', '-1', '1e6', '1,5', '01', ' 1', '0.0000001']) assert.throws(() => donationAmount(a, 'USDC'));
});
test('mainnet and missing/invalid trusted profile are refused', () => {
  assert.throws(() => prepareDonationIntent({ requestIdentity: 'x', creator: { id: 'x', version: 1, wallet: recipient }, donor, asset: 'ETH', amount: '1', nonce: 0, chainId: 8453 }));
  for (const creator of [null, { id: 'x', wallet: recipient }, { id: '', version: 1, wallet: recipient }]) assert.throws(() => prepareDonationIntent({ requestIdentity: 'x', creator, donor, asset: 'ETH', amount: '1', nonce: 0 }));
});
for (const field of ['creatorId', 'creatorVersion', 'recipient', 'donor', 'amountUnits', 'platformFeeBps', 'assetContract', 'originalRequestIdentity']) {
  test(`tampered ${field} is refused`, () => {
    const i = structuredClone(intent()); i[field] = typeof i[field] === 'number' ? i[field] + 1 : String(i[field]) + 'x';
    assert.throws(() => verifyDonationReceipt(i, views(intent()), txHash));
  });
}
for (const [label, mutate] of [
  ['wrong recipient', v => { v.tx.to = donor; }],
  ['wrong chain', v => { v.tx.chainId = 8453; }],
  ['wrong donor', v => { v.tx.from = recipient; }],
  ['wrong nonce', v => { v.tx.nonce = 8; }],
  ['wrong calldata', v => { v.tx.data = '0x'; }],
  ['unexpected native value', v => { v.tx.value = 1n; }],
  ['reorg', v => { v.canonicalBlockHash = '0x' + 'c'.repeat(64); }],
  ['pending confirmation', v => { v.latestBlock = 101; }],
  ['removed event', v => { v.receipt.logs[0].removed = true; }],
  ['reverted transaction', v => { v.receipt.status = 0; }],
  ['missing transfer', v => { v.receipt.logs = []; }],
  ['duplicate transfer', v => { v.receipt.logs.push({ ...v.receipt.logs[0], index: 3 }); }],
]) test(label, () => {
  const i = intent(), v = views(i); v.forEach(mutate); assert.throws(() => verifyDonationReceipt(i, v, txHash));
});
test('independent RPC disagreement never settles', () => {
  const i = intent(), v = views(i); v[1].receipt.logs[0].data = '0x' + '0'.repeat(64);
  assert.throws(() => verifyDonationReceipt(i, v, txHash));
});
test('same payment proof retains one transaction claim across retries', () => {
  const i = intent(), v = views(i);
  assert.deepEqual(verifyDonationReceipt(i, v, txHash), verifyDonationReceipt(i, v, txHash));
  const replay = prepareDonationIntent({ requestIdentity: 'different-request', creator: { id: 'streamer-1', version: 3, wallet: recipient }, donor, asset: 'USDC', amount: '1.5', nonce: 7 });
  assert.equal(verifyDonationReceipt(replay, v, txHash).transactionClaimKey, verifyDonationReceipt(i, v, txHash).transactionClaimKey);
  // Existing durable consumer MUST claim this key uniquely, not credit both requests.
});
