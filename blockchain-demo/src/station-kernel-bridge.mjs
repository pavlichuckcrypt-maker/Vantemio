// Station kernel consumer bridge — blockchain module -> Station kernel accounting/graph
// Uses Station's existing durable mechanisms (tools/state/* + brain_memory/graph.sqlite via graphmem.py), no parallel brain
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const STATION_ROOT = process.env.STATION_ROOT || null;
const EVENTS_FILE = STATION_ROOT && path.join(STATION_ROOT, 'tools', 'state', 'blockchain_kernel_events.jsonl');
const GRAPH_SCRIPT = STATION_ROOT && path.join(STATION_ROOT, 'brain_memory', 'graphmem.py');

function tryGraphMirror(event, graphId) {
  if (!fs.existsSync(GRAPH_SCRIPT)) return { ok:false, reason:'graphmem.py missing at '+GRAPH_SCRIPT };
  const label = event.type || 'blockchain-event';
  const props = JSON.stringify({ releaseId: event.releaseId, tokenId: event.tokenId, chainId: event.chainId||84532, exchangeId: event.exchangeId, offerId: event.offerId, state: event.state }).slice(0,800);
  const args = ['node','--id', graphId, '--kind','event','--label', label, '--props', props];
  for (const bin of ['python3','python']) {
    try {
      const r = spawnSync(bin, [GRAPH_SCRIPT, ...args], { timeout: 8000, encoding:'utf8', env:{...process.env, AIMMEM_HOME: path.dirname(GRAPH_SCRIPT)} });
      if (r.status===0) return { ok:true, bin };
      if (r.error && r.error.code==='ENOENT') continue;
      // non-zero but graph locked — durable file is still source of truth
      if (r.stderr && r.stderr.includes('locked')) return { ok:false, reason:'db locked (retry later)', bin, stderr:r.stderr.slice(0,400) };
      if (r.status!==0) return { ok:false, reason:'exit '+r.status, bin, stderr:(r.stderr||'').slice(0,500) };
    } catch (e) { continue; }
  }
  return { ok:false, reason:'no python available' };
}


// Provenance guard: blockchain events only via this bridge; learning advice never overwrites durable.
// Criterion 4 — model assertion != on-chain fact; confirmed results/failure lessons are append-only.
export function assertNotModelAdvice(event) {
  if (event && (event.source === 'model' || event.source === 'llm' || event.advice === true))
    throw new Error('Model advice must not be recorded as on-chain fact; use explicit lesson append');
  if (event && event.type === 'learning' && !event.lessonId)
    throw new Error('Learning event requires explicit lessonId provenance');
  return true;
}

// Append caller->consumer event to Station's durable log (admission/accounting)
export function emitKernelEvent(event) {
  assertNotModelAdvice(event);
  if (!STATION_ROOT) return { status: 'disabled', reason: 'Explicit STATION_ROOT required', recorded: false };
  const entry = {
    at: new Date().toISOString(),
    module: 'blockchain-demo',
    extendable: true, // not montage-only
    ...event,
  };
  fs.mkdirSync(path.dirname(EVENTS_FILE), { recursive: true });
  fs.appendFileSync(EVENTS_FILE, JSON.stringify(entry) + '\n', { mode: 0o600 });
  // Best-effort mirror to Station graph (if available) — explicit provenance, idempotent
  try {
    const gid = `blockchain:${event.releaseId||event.exchangeId||event.offerId||event.tokenId||Date.now()}:${event.type||'event'}`;
    tryGraphMirror(event, gid);
  } catch {}
  return entry;
}

export function emitReleaseKernelEvent({ releaseId, videoHash, metadataHash, termsHash, owner, tokenId, chainId=84532, tx, idempotent }) {
  return emitKernelEvent({ type: 'release', releaseId, videoHash, metadataHash, termsHash, owner, tokenId, chainId, tx, idempotent: !!idempotent });
}
export function emitOrderKernelEvent({ orderId, exchangeId, offerId, buyer, seller, state, chainId=84532, tx, action }) {
  return emitKernelEvent({ type: 'order', orderId, exchangeId, offerId, buyer, seller, state, chainId, tx, action });
}
export function emitCommerceKernelEvent(details) {
  return emitKernelEvent({ type: 'commerce', ...details, chainId: details.chainId||84532 });
}
export function emitTransferKernelEvent({ releaseId, tokenId, from, to, chainId=84532, tx }) {
  return emitKernelEvent({ type: 'transfer', releaseId, tokenId: String(tokenId), from: String(from||'').toLowerCase(), to: String(to||'').toLowerCase(), chainId, tx });
}
export function emitVantemioBindingKernelEvent({ releaseId, tokenId, exchangeId, offerId, channelId, artifact, chainId=84532 }) {
  // Binds existing Boson order + NFT release to SAME Vantemio admitted task/release — no new queue/contract/wallet
  if (!releaseId || !tokenId || !exchangeId || !channelId) throw new Error('vantemio binding requires releaseId, tokenId, exchangeId, channelId');
  if (!String(channelId).startsWith('UC')) throw new Error('channelId must be YouTube channel UC*');
  return emitKernelEvent({ type: 'vantemio-binding', releaseId, tokenId: String(tokenId), exchangeId: String(exchangeId), offerId: offerId ? String(offerId) : undefined, channelId: String(channelId), artifact: String(artifact||releaseId), chainId });
}

export function emitDeliveryKernelEvent({ exchangeId, assetId, assetSha256, releaseId, listingId, channelId, chainId=84532, originalRequestIdentity, original_request_identity }) {
  // Delivery lineage for same task/release/artifact — reuses existing order + asset, no new contract/queue
  if (!exchangeId || !assetId || !assetSha256) throw new Error('delivery event requires exchangeId, assetId, assetSha256');
  const hasCamel = originalRequestIdentity !== undefined && originalRequestIdentity !== null && String(originalRequestIdentity) !== '';
  const hasSnake = original_request_identity !== undefined && original_request_identity !== null && String(original_request_identity) !== '';
  if (hasCamel && hasSnake && String(originalRequestIdentity) !== String(original_request_identity)) throw new Error('Conflicting original request identities');
  let orig;
  if (hasCamel) orig = String(originalRequestIdentity);
  else if (hasSnake) orig = String(original_request_identity);
  // preserve original identity, do not invent; missing stays pending, conflict already rejected
  if (orig !== undefined && orig !== '') {
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(orig)) throw new Error('Invalid originalRequestIdentity');
  } else {
    orig = undefined;
  }
  return emitKernelEvent({ type: 'delivery', exchangeId: String(exchangeId), assetId: String(assetId), assetSha256: String(assetSha256), releaseId: releaseId ? String(releaseId) : undefined, listingId: listingId ? String(listingId) : undefined, channelId: channelId ? String(channelId) : undefined, chainId, ...(orig !== undefined ? { originalRequestIdentity: orig, original_request_identity: orig } : {}) });
}

// Query/status via Station durable — no parallel registry, paginated discovery (fleet rule)
export function queryKernelEvents({ type, releaseId, exchangeId, offerId, tokenId, channelId, assetId, assetSha256, limit, offset } = {}) {
  if (!EVENTS_FILE || !fs.existsSync(EVENTS_FILE)) return [];
  const lines = fs.readFileSync(EVENTS_FILE, 'utf8').split('\n').filter(Boolean);
  const out = [];
  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      if (type && e.type !== type) continue;
      if (releaseId && e.releaseId !== releaseId) continue;
      if (exchangeId && e.exchangeId !== exchangeId) continue;
      if (offerId && e.offerId !== offerId) continue;
      if (tokenId && String(e.tokenId) !== String(tokenId)) continue;
      if (channelId && e.channelId !== channelId) continue;
      if (assetId && e.assetId !== assetId) continue;
      if (assetSha256 && e.assetSha256 !== assetSha256) continue;
      out.push(e);
    } catch {}
  }
  const off = Number.isFinite(Number(offset)) ? Math.max(0, Number(offset)) : 0;
  const lim = Number.isFinite(Number(limit)) ? Math.max(0, Number(limit)) : out.length;
  if (off || lim !== out.length) return out.slice(off, off + lim);
  return out;
}
export function getKernelEventStatus(releaseId) {
  const events = queryKernelEvents({ releaseId });
  if (!events.length) return { found: false };
  const last = events[events.length - 1];
  return { found: true, count: events.length, last, types: [...new Set(events.map(e=>e.type))] };
}
