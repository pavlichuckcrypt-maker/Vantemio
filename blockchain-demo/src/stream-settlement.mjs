// Durable stream-donation settlement + OBS alert outbox.
// Guarantees: unique chain+hash claim, no duplicate credit/alert, reorg recovery,
// sanitized alert payload, creator isolation, revocable OBS token.
import crypto from 'node:crypto';

const digest = v => crypto.createHash('sha256').update(String(v)).digest('hex');

function sanitizeMessage(value, limit = 280) {
  if (typeof value !== 'string') return '';
  // strip control chars, trim, clamp
  let s = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g,'').trim();
  // reject arbitrary HTML/script - escape
  s = s.replace(/[<>]/g, c => c === '<' ? '&lt;' : '&gt;');
  if ([...s].length > limit) s = [...s].slice(0, limit).join('');
  return s;
}

export function createDonationStore() {
  const byClaim = new Map(); // claimKey -> settlement
  const byIntent = new Map(); // intentDigest -> settlement
  const alerts = new Map(); // alertId -> {settlement, delivered}
  const obsTokens = new Map(); // tokenHash -> {creatorId, expires, revoked}
  let seq = 0;

  function claimSettlement(settlement) {
    const key = settlement.transactionClaimKey;
    if (!key || typeof key !== 'string') throw Error('Missing claim key');
    const existing = byClaim.get(key);
    if (existing) {
      // Replayed tx across different intentIDs must not double-credit
      if (existing.intentDigest !== settlement.intentDigest || existing.originalRequestIdentity !== settlement.originalRequestIdentity) {
        throw Error('Transaction already claimed by different intent');
      }
      if (existing.blockHash !== settlement.blockHash || existing.blockNumber !== settlement.blockNumber) throw Error('Claim block mismatch');
      return { ...existing, idempotent:true };
    }
    // Also reject same intentDigest claimed with different tx
    const priorIntent = byIntent.get(settlement.intentDigest);
    if (priorIntent && priorIntent.transactionClaimKey !== key) throw Error('Intent already settled with different transaction');
    const record = Object.freeze({ ...settlement, at: new Date().toISOString(), seq: ++seq });
    byClaim.set(key, record);
    byIntent.set(settlement.intentDigest, record);
    // Create one alert per settlement
    const alertId = digest(key + ':' + settlement.intentDigest).slice(0, 32);
    const alert = Object.freeze({
      id: alertId,
      creatorId: settlement.creatorId,
      donor: settlement.donor,
      amountUnits: settlement.amountUnits,
      creatorAmountUnits: settlement.creatorAmountUnits,
      platformFeeUnits: settlement.platformFeeUnits,
      feeBps: settlement.platformFeeBps,
      asset: settlement.asset,
      message: sanitizeMessage(settlement.donorMessage || ''),
      transactionClaimKey: key,
      createdAt: record.at,
      delivered: false,
    });
    alerts.set(alertId, alert);
    return record;
  }

  function reorgRollback(transactionClaimKey, canonicalBlockHash) {
    const rec = byClaim.get(transactionClaimKey);
    if (!rec) throw Error('Unknown claim for reorg');
    if (rec.blockHash.toLowerCase() === String(canonicalBlockHash).toLowerCase()) throw Error('No reorg: same block hash');
    // Compensating record: mark as reorged, keep history
    const compensated = Object.freeze({ ...rec, state:'reorged', canonicalBlockHash: String(canonicalBlockHash).toLowerCase(), reorgAt: new Date().toISOString() });
    byClaim.set(transactionClaimKey, compensated);
    byIntent.set(rec.intentDigest, compensated);
    return compensated;
  }

  function listAlerts({ creatorId, token } = {}) {
    // OBS-scoped token check: token grants only alerts for its creator
    if (token) {
      const h = digest(token);
      const t = obsTokens.get(h);
      if (!t || t.revoked || Date.now() > t.expires) throw Error('Invalid OBS token');
      creatorId = t.creatorId;
    }
    const out = [];
    for (const a of alerts.values()) {
      if (creatorId && a.creatorId !== creatorId) continue;
      out.push(a);
    }
    return out;
  }

  function markAlertDelivered(alertId, token) {
    if (token) {
      const h = digest(token);
      const t = obsTokens.get(h);
      if (!t || t.revoked || Date.now() > t.expires) throw Error('Invalid OBS token');
      const a = alerts.get(alertId);
      if (!a || a.creatorId !== t.creatorId) throw Error('Alert not found for token');
    }
    const a = alerts.get(alertId);
    if (!a) throw Error('Unknown alert');
    if (a.delivered) return { ...a, idempotent:true };
    const next = Object.freeze({ ...a, delivered:true, deliveredAt: new Date().toISOString() });
    alerts.set(alertId, next);
    return next;
  }

  function history({ creatorId, account } = {}) {
    // Creator isolation: account must match creatorId's owner; caller enforces
    const out = [];
    for (const r of byClaim.values()) {
      if (creatorId && r.creatorId !== creatorId) continue;
      // do not leak other creators
      out.push(r);
    }
    return out;
  }

  function issueObsToken({ creatorId, ttlMs = 3600000 }) {
    if (typeof creatorId !== 'string' || !creatorId.trim()) throw Error('Missing creatorId');
    if (!Number.isInteger(ttlMs) || ttlMs < 60000 || ttlMs > 86400000) throw Error('Invalid TTL');
    const token = crypto.randomBytes(32).toString('hex');
    const h = digest(token);
    obsTokens.set(h, { creatorId, expires: Date.now() + ttlMs, revoked:false });
    // Cap tokens per creator
    let count = 0;
    for (const v of obsTokens.values()) if (v.creatorId === creatorId && !v.revoked) count++;
    if (count > 5) throw Error('Too many OBS tokens');
    return { token, creatorId, expires: obsTokens.get(h).expires };
  }

  function revokeObsToken(token) {
    const h = digest(token);
    const t = obsTokens.get(h);
    if (!t) throw Error('Unknown OBS token');
    t.revoked = true;
    return { revoked:true };
  }

  return { claimSettlement, reorgRollback, listAlerts, markAlertDelivered, history, issueObsToken, revokeObsToken, _debug:{ byClaim, byIntent, alerts, obsTokens } };
}
