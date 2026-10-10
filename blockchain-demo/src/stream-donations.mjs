// Stream donation capability - fee-aware 1% platform split (testnet-only).
// Pure testnet intent/receipt boundary. Never signs, broadcasts or stores funds.
// Fee: 100 bps = 1% platform, 99% creator. Integer math on smallest units, no rounding beyond floor.
import { createHash } from 'node:crypto';
import { Interface, getAddress, parseUnits } from 'ethers';
import { assertWalletReceiptAgreement } from './wallet-receipt.mjs';

export const DONATION_CHAIN_ID = 84532;
export const DONATION_USDC = getAddress('0x036CbD53842c5426634e7929541eC2318f3dCF7e');
export const PLATFORM_FEE_BPS = 100;
export const FEE_DENOMINATOR = 10000;
// Trusted testnet treasury - MUST be overwritten by approved deployment config for production.
// This placeholder is testnet-only and is validated as non-zero checksummed address.
export const DONATION_TREASURY_PLACEHOLDER = getAddress('0x3333333333333333333333333333333333333333');

const token = new Interface([
  'function transfer(address to, uint256 amount) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);
const zero = '0x0000000000000000000000000000000000000000';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const address = value => {
  const result = getAddress(value);
  if (result === zero) throw Error('Zero donation address');
  return result;
};
const identity = value => {
  const s = typeof value === 'string' ? value.trim() : (value != null ? String(value).trim() : '');
  if (!s || s.length > 256) throw Error('Missing original identity');
  return s;
};
function resolveTreasury(input) {
  if (input) return address(input);
  const env = (typeof process !== 'undefined' ? process.env.DONATION_TREASURY_ADDRESS : '') || '';
  if (env) return address(env);
  return DONATION_TREASURY_PLACEHOLDER;
}

export function donationAmount(amount, asset) {
  if (!['ETH', 'USDC'].includes(asset)) throw Error('Unsupported donation asset');
  if (typeof amount !== 'string' || !/^(?:0|[1-9]\d{0,77})(?:\.\d+)?$/.test(amount)) throw Error('Invalid decimal amount');
  const units = parseUnits(amount, asset === 'USDC' ? 6 : 18);
  if (units <= 0n || units >= 2n ** 256n) throw Error('Donation amount out of range');
  return units;
}

export function calculateFeeSplit(amountUnits) {
  const total = BigInt(amountUnits);
  if (total <= 0n) throw Error('Amount must be positive');
  const fee = (total * BigInt(PLATFORM_FEE_BPS)) / BigInt(FEE_DENOMINATOR);
  const creatorAmount = total - fee;
  if (creatorAmount <= 0n) throw Error('Creator amount must be positive after fee');
  return { total: total.toString(), fee: fee.toString(), creatorAmount: creatorAmount.toString(), feeBps: PLATFORM_FEE_BPS };
}

/** creator MUST come from the authenticated, versioned existing profile store.
 * Client-submitted wallet/profile data and a digest alone are not authenticated authority.
 * Persist the returned intent through existing durable/idempotency storage before checkout.
 * Treasury is resolved from trusted config (env or explicit) - never from donor input.
 */
export function prepareDonationIntent({ requestIdentity, creator, donor, asset, amount, nonce, chainId = DONATION_CHAIN_ID, treasury }) {
  if (chainId !== DONATION_CHAIN_ID) throw Error('Only Base Sepolia donation calibration is enabled');
  if (!creator || !Number.isSafeInteger(creator.version) || creator.version < 1) throw Error('Versioned creator profile required');
  const creatorId = identity(creator.id), recipient = address(creator.wallet), sender = address(donor);
  const treasuryAddr = resolveTreasury(treasury);
  if (treasuryAddr.toLowerCase() === recipient.toLowerCase()) throw Error('Treasury must differ from creator');
  if (treasuryAddr.toLowerCase() === sender.toLowerCase()) throw Error('Treasury must differ from donor');
  if (typeof nonce !== 'number' || !Number.isSafeInteger(nonce) || nonce < 0) throw Error('Trusted pending nonce required');
  const value = donationAmount(amount, asset);
  const split = calculateFeeSplit(value);
  const tx = Object.freeze({
    chainId,
    from: sender,
    to: asset === 'ETH' ? recipient : DONATION_USDC,
    data: asset === 'ETH' ? '0x' : token.encodeFunctionData('transfer', [recipient, value]),
    value: asset === 'ETH' ? value.toString() : '0',
    nonce,
  });
  const core = {
    schema: 'vantemio.stream-donation-intent/v1',
    originalRequestIdentity: identity(requestIdentity), creatorId, creatorVersion: creator.version,
    chainId, asset, assetContract: asset === 'ETH' ? null : DONATION_USDC,
    recipient, treasury: treasuryAddr, donor: sender, amountUnits: value.toString(),
    creatorAmountUnits: split.creatorAmount, platformFeeUnits: split.fee, platformFeeBps: PLATFORM_FEE_BPS, tx,
  };
  return Object.freeze({ ...core, intentDigest: hash(core) });
}

/** views are SERVER-fetched from two independently configured RPC routes.
 * The caller must claim chainId+transactionHash uniquely in the existing store.
 * A positive return is receipt verification, NOT durable credit or alert dispatch.
 * Fee split is verified via integer math; on-chain transfer is the full amount to creator
 * (platform fee accounted atomically in durable settlement, not as separate on-chain tx).
 */
export function verifyDonationReceipt(intent, views, transactionHash) {
  if (!intent || intent.schema !== 'vantemio.stream-donation-intent/v1') throw Error('Unknown donation intent');
  if (intent.platformFeeBps !== PLATFORM_FEE_BPS) throw Error('Donation intent fee mismatch');
  const expectedTreasury = resolveTreasury(intent.treasury);
  if (address(intent.treasury) !== expectedTreasury) throw Error('Donation treasury mismatch');
  // Reconstruct every accepted field; reject forged payment settings and intent changes.
  const rebuilt = prepareDonationIntent({
    requestIdentity: intent.originalRequestIdentity,
    creator: { id: intent.creatorId, version: intent.creatorVersion, wallet: intent.recipient },
    donor: intent.donor,
    asset: intent.asset,
    amount: unitsToDecimal(intent.amountUnits, intent.asset),
    nonce: intent.tx?.nonce,
    chainId: intent.chainId,
    treasury: intent.treasury,
  });
  if (intent.intentDigest !== rebuilt.intentDigest
    || intent.assetContract !== rebuilt.assetContract
    || intent.creatorAmountUnits !== rebuilt.creatorAmountUnits
    || intent.platformFeeUnits !== rebuilt.platformFeeUnits
    || JSON.stringify(intent.tx) !== JSON.stringify(rebuilt.tx)) {
    throw Error('Donation intent changed');
  }
  // Integer math invariant: creator + fee == total
  if (BigInt(intent.creatorAmountUnits) + BigInt(intent.platformFeeUnits) !== BigInt(intent.amountUnits)) throw Error('Fee split invariant violated');
  if (BigInt(intent.platformFeeUnits) !== (BigInt(intent.amountUnits) * BigInt(PLATFORM_FEE_BPS) / BigInt(FEE_DENOMINATOR))) throw Error('Fee calculation mismatch');
  if (typeof transactionHash !== 'string' || !/^0x[\da-f]{64}$/i.test(transactionHash)) throw Error('Invalid transaction hash');
  const receipt = assertWalletReceiptAgreement(views, transactionHash);
  if (receipt.status !== 1) throw Error('Donation transaction reverted');
  for (const { tx } of views) {
    if (Number(tx.chainId) !== intent.chainId || address(tx.from) !== intent.donor
      || address(tx.to) !== intent.tx.to || String(tx.data).toLowerCase() !== intent.tx.data.toLowerCase()
      || BigInt(tx.value) !== BigInt(intent.tx.value) || BigInt(tx.nonce) !== BigInt(intent.tx.nonce)) {
      throw Error('Donation transaction differs from prepared intent');
    }
  }
  let logIndex = null;
  if (intent.asset === 'USDC') {
    const matching = receipt.logs.filter(log => {
      if (getAddress(log.address) !== DONATION_USDC) return false;
      let event;
      try { event = token.parseLog(log); } catch { return false; }
      return event?.name === 'Transfer' && address(event.args.from) === intent.donor
        && address(event.args.to) === intent.recipient && event.args.value === BigInt(intent.amountUnits);
    });
    if (matching.length !== 1) throw Error('Exactly one canonical USDC donation transfer required');
    logIndex = matching[0].index ?? matching[0].logIndex;
    if (!Number.isSafeInteger(logIndex) || logIndex < 0) throw Error('Invalid transfer log index');
  }
  return Object.freeze({
    schema: 'vantemio.stream-donation-settlement/v1',
    originalRequestIdentity: intent.originalRequestIdentity, intentDigest: intent.intentDigest,
    creatorId: intent.creatorId, creatorVersion: intent.creatorVersion,
    chainId: intent.chainId, transactionHash: transactionHash.toLowerCase(),
    transactionClaimKey: `${intent.chainId}:${transactionHash.toLowerCase()}`,
    blockNumber: receipt.blockNumber, blockHash: receipt.blockHash.toLowerCase(), logIndex,
    asset: intent.asset, assetContract: intent.assetContract, recipient: intent.recipient,
    treasury: intent.treasury, donor: intent.donor, amountUnits: intent.amountUnits,
    creatorAmountUnits: intent.creatorAmountUnits, platformFeeUnits: intent.platformFeeUnits,
    platformFeeBps: PLATFORM_FEE_BPS,
    state: 'verified-awaiting-durable-consumer', testnet: true,
  });
}

function unitsToDecimal(value, asset) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,77}$/.test(value)) throw Error('Invalid amount units');
  const decimals = asset === 'USDC' ? 6 : 18;
  const digits = value.padStart(decimals + 1, '0');
  return `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`;
}
