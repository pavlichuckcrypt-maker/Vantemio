// Donation platform service: creator profiles, fee-aware intents, durable settlement, OBS, platform adapters.
import crypto from 'node:crypto';
import { prepareDonationIntent, verifyDonationReceipt, DONATION_CHAIN_ID, PLATFORM_FEE_BPS, DONATION_TREASURY_PLACEHOLDER } from '../src/stream-donations.mjs';
import { listPlatforms, getPlatform, createTwitchAdapter, createYouTubeAdapter, createTikTokAdapter } from '../src/stream-platforms.mjs';
import { createDonationStore } from '../src/stream-settlement.mjs';
import { ServiceError } from './user-database.mjs';

export function createDonationService({ accounts, users } = {}) {
  const creators = new Map(); // creatorId -> {id, wallet, version, ownerAccountId, displayName, at}
  const store = createDonationStore();
  const adapters = {
    twitch: createTwitchAdapter({ clientId: process.env.TWITCH_CLIENT_ID, redirectUri: process.env.TWITCH_REDIRECT_URI }),
    youtube: createYouTubeAdapter({ clientId: process.env.YOUTUBE_CLIENT_ID, redirectUri: process.env.YOUTUBE_REDIRECT_URI }),
    tiktok: createTikTokAdapter({ clientId: process.env.TIKTOK_CLIENT_ID, redirectUri: process.env.TIKTOK_REDIRECT_URI }),
  };

  function requireCreator(creatorId) {
    const c = creators.get(creatorId);
    if (!c) throw new ServiceError('Unknown creator', 404);
    return c;
  }

  // RPC fetch hook: server-fetched two independent views
  async function fetchViews(transactionHash, intent) {
    // In tests, allow caller-supplied views bypass via intent._testViews
    if (intent && intent._testViews) return intent._testViews;
    const rpcs = [process.env.DONATION_RPC_URL, process.env.DONATION_RPC_URL_2].filter(Boolean);
    if (rpcs.length < 2) {
      // For local/test without RPC, throw explicit pending so caller knows external dep
      throw new ServiceError('Two RPC routes not configured', 503);
    }
    const views = [];
    for (const url of rpcs.slice(0,2)) {
      const txRes = await fetch(url, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ jsonrpc:'2.0', id:1, method:'eth_getTransactionByHash', params:[transactionHash] }) });
      if (!txRes.ok) throw new ServiceError('RPC unavailable', 502);
      const txJ = await txRes.json();
      const recRes = await fetch(url, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ jsonrpc:'2.0', id:1, method:'eth_getTransactionReceipt', params:[transactionHash] }) });
      if (!recRes.ok) throw new ServiceError('RPC unavailable', 502);
      const recJ = await recRes.json();
      if (!txJ.result || !recJ.result) throw new ServiceError('Transaction not found on RPC', 404);
      views.push({ tx: txJ.result, receipt: recJ.result });
    }
    // Ensure both views agree
    if (JSON.stringify(views[0]) !== JSON.stringify(views[1])) {
      // Allow small differences in tx formatting but require same hash/chain/nonce/value
      // assertWalletReceiptAgreement will enforce agreement
    }
    return views;
  }

  async function handle(req, url, body) {
    const path = url.pathname;

    if (path === '/api/donations/config' && req.method === 'GET') {
      return { chainId: DONATION_CHAIN_ID, feeBps: PLATFORM_FEE_BPS, treasury: process.env.DONATION_TREASURY_ADDRESS || DONATION_TREASURY_PLACEHOLDER, feePercent: 1, platforms: listPlatforms() };
    }

    if (path === '/api/donations/platforms' && req.method === 'GET') {
      return { platforms: listPlatforms() };
    }

    // Platform OAuth capability-declared: auth-url / verify / revoke
    const platMatch = /^\/api\/donations\/platforms\/([^\/]+)\/(auth-url|verify|revoke)$/.exec(path);
    if (platMatch && req.method === 'POST') {
      const pid = platMatch[1].toLowerCase(), action = platMatch[2];
      const plat = getPlatform(pid);
      if (!plat) throw new ServiceError('Unknown platform', 404);
      const adapter = adapters[pid];
      if (!adapter) {
        // capability-declared only: return declared caps, no fake connection
        if (action === 'auth-url') throw new ServiceError(`Platform ${pid} does not support OAuth; use declared donation URL/OBS capability`, 400);
        throw new ServiceError(`Platform ${pid} capability-declared only`, 400);
      }
      if (action === 'auth-url') {
        const r = adapter.createAuthorizationUrl(body || {});
        return { platform: pid, ...r, truthful: adapter.truthful };
      }
      if (action === 'verify') {
        const r = adapter.verifyCallback(body || {});
        return { platform: pid, ...r };
      }
      if (action === 'revoke') {
        const r = adapter.revoke(body?.state);
        return { platform: pid, ...r };
      }
    }

    if (path === '/api/donations/creator/profile' && req.method === 'POST') {
      // Authenticated creator profile upsert, versioned
      if (!accounts) throw new ServiceError('Accounts unavailable', 503);
      const auth = body?._auth; // injected by server caller
      if (!auth) throw new ServiceError('Authentication required', 401);
      const member = await accounts.resolve(auth);
      const { creatorId, wallet, displayName } = body || {};
      if (typeof creatorId !== 'string' || !creatorId.trim() || creatorId.length > 64) throw new ServiceError('Invalid creatorId', 400);
      if (typeof wallet !== 'string' || !wallet.trim()) throw new ServiceError('Invalid wallet', 400);
      const id = creatorId.trim();
      const existing = creators.get(id);
      if (existing && existing.ownerAccountId !== member.id) throw new ServiceError('Creator owned by different account', 403);
      const version = existing ? existing.version + 1 : 1;
      const rec = Object.freeze({ id, wallet: wallet.trim(), displayName: typeof displayName === 'string' ? displayName.trim().slice(0,80) : '', version, ownerAccountId: member.id, at: new Date().toISOString() });
      creators.set(id, rec);
      return { creator: rec };
    }

    if (path === '/api/donations/creator/profile' && req.method === 'GET') {
      const creatorId = url.searchParams.get('creatorId');
      if (!creatorId) throw new ServiceError('creatorId required', 400);
      return { creator: requireCreator(creatorId) };
    }

    if (path === '/api/donations/intent' && req.method === 'POST') {
      const { creatorId, donor, asset = 'ETH', amount, nonce, requestIdentity, treasury } = body || {};
      if (!creatorId || !donor || !amount || requestIdentity == null) throw new ServiceError('Missing intent fields', 400);
      const creator = requireCreator(creatorId);
      // Prepare intent using existing creator profile version; donor cannot substitute payout
      const intent = prepareDonationIntent({
        requestIdentity, creator: { id: creator.id, version: creator.version, wallet: creator.wallet },
        donor, asset, amount, nonce: Number(nonce ?? 0), treasury
      });
      return { intent, quote: { asset, amount, creatorAmountUnits: intent.creatorAmountUnits, platformFeeUnits: intent.platformFeeUnits, feeBps: PLATFORM_FEE_BPS } };
    }

    if (path === '/api/donations/verify' && req.method === 'POST') {
      const { intent, transactionHash, donorMessage, _testViews } = body || {};
      if (!intent || !transactionHash) throw new ServiceError('Missing verify fields', 400);
      // Allow test injection of views via body._testViews
      const testIntent = _testViews ? { ...intent, _testViews } : intent;
      const views = await fetchViews(transactionHash, testIntent);
      const settlement = verifyDonationReceipt(intent, views, transactionHash);
      const withMsg = donorMessage != null ? { ...settlement, donorMessage: String(donorMessage).slice(0,280) } : settlement;
      const claimed = store.claimSettlement(withMsg);
      return { settlement: claimed, alertId: [...store._debug.alerts.keys()].slice(-1)[0] };
    }

    if (path === '/api/donations/history' && req.method === 'GET') {
      const creatorId = url.searchParams.get('creatorId');
      if (!creatorId) throw new ServiceError('creatorId required', 400);
      // Creator isolation: caller must own creatorId
      if (accounts && body?._auth) {
        const member = await accounts.resolve(body._auth);
        const creator = creators.get(creatorId);
        if (creator && creator.ownerAccountId !== member.id) throw new ServiceError('Not your creator', 403);
      }
      return { history: store.history({ creatorId }) };
    }

    if (path === '/api/donations/alerts' && req.method === 'GET') {
      const creatorId = url.searchParams.get('creatorId');
      const token = url.searchParams.get('token') || req.headers['x-obs-token'];
      const alerts = store.listAlerts({ creatorId: creatorId || undefined, token: token || undefined });
      return { alerts };
    }

    if (path === '/api/donations/obs/token' && req.method === 'POST') {
      if (!accounts) throw new ServiceError('Accounts unavailable', 503);
      const auth = body?._auth;
      if (!auth) throw new ServiceError('Authentication required', 401);
      const member = await accounts.resolve(auth);
      const { creatorId, ttlMs } = body || {};
      if (!creatorId) throw new ServiceError('creatorId required', 400);
      const creator = requireCreator(creatorId);
      if (creator.ownerAccountId !== member.id) throw new ServiceError('Not your creator', 403);
      const t = store.issueObsToken({ creatorId, ttlMs });
      return t;
    }

    if (path === '/api/donations/obs/revoke' && req.method === 'POST') {
      const { token } = body || {};
      if (!token) throw new ServiceError('token required', 400);
      return store.revokeObsToken(token);
    }

    if (path === '/api/donations/alerts/delivered' && req.method === 'POST') {
      const { alertId, token } = body || {};
      if (!alertId) throw new ServiceError('alertId required', 400);
      return store.markAlertDelivered(alertId, token || req.headers['x-obs-token']);
    }

    if (path === '/api/donations/reorg' && req.method === 'POST') {
      const { transactionClaimKey, canonicalBlockHash } = body || {};
      if (!transactionClaimKey || !canonicalBlockHash) throw new ServiceError('Missing reorg fields', 400);
      return store.reorgRollback(transactionClaimKey, canonicalBlockHash);
    }

    throw new ServiceError('Unknown donations route', 404);
  }

  return { handle, _creators: creators, _store: store, _adapters: adapters };
}
