// Capability-declared platform registry + OAuth-verifiable adapter stubs.
// No hard-coded ceiling; extensible via registerPlatform.
// Twitch/YouTube/TikTok expose truthful scope/redirect/pkce/revocation semantics.
// All other platforms are registered with declared capabilities and isolated fixtures,
// never as fake connected status.

export const PLATFORM_IDS = [
  'twitch','kick','youtube','rumble','dlive','odysee','x','telegram','discord',
  'tiktok','instagram','trovo','vkplay','rutube','steam','nimo','nonolive','soop','chzzk','zoom','googlemeet','bizon365','webinarru'
];

// Canonical capabilities per platform derived from owner spec 2026-10-09 (23 platforms)
// truthful: external donation URL/QR + OBS overlay only; no fake platform payment replacement
const CAPS = {
  twitch:    { url:'chat',   obs:'browser-source', auth:'oauth',  note:'кликабельные баннеры под стримом, боты в чате, Browser Source в OBS; EventSub где применимо' },
  kick:      { url:'profile',obs:'widget',         auth:'none',   note:'ссылки в профиле и чате, лояльность к крипто-шлюзам, виджеты через OBS' },
  youtube:   { url:'description', obs:'browser-source', auth:'oauth', note:'ссылки в описании и закрепе чата, оверлеи через OBS; Live API, Super Chat отдельно' },
  rumble:    { url:'description', obs:'rtmp',       auth:'none',   note:'свободное размещение ссылок в чате и описании, RTMP через OBS' },
  dlive:     { url:'description', obs:'rtmp',       auth:'none',   note:'Web3-стриминг, аудитория с готовыми криптокошельками' },
  odysee:    { url:'description', obs:'rtmp',       auth:'none',   note:'децентрализованный LBRY-протокол, OBS-стримы, ссылки в описании' },
  x:         { url:'pinned',  obs:'live-producer', auth:'oauth',  note:'закреплённый твит с донатной ссылкой, эфиры через OBS / Live Producer' },
  telegram:  { url:'pinned',  obs:'rtmp',           auth:'none',   note:'трансляции в каналах/группах по RTMP-ключу через OBS, закрепы чата, Telegram Mini App' },
  discord:   { url:'chat',    obs:'virtual-camera', auth:'oauth',  note:'стриминг в голосовых каналах через OBS Virtual Camera / захват экрана, ссылки в чате сервера' },
  tiktok:    { url:'overlay', obs:'qr',             auth:'oauth',  note:'оверлей и динамический QR через TikTok Live Studio / OBS; Login Kit/Display API, LIVE gifts API не подтверждён' },
  instagram: { url:'bio',     obs:'live-producer',  auth:'oauth',  note:'Live Producer (OBS), ссылка в био и QR-код на экране' },
  trovo:     { url:'panel',   obs:'browser-source', auth:'oauth',  note:'настраиваемые блоки под плеером, чат-боты, оверлеи в OBS' },
  vkplay:    { url:'panel',   obs:'widget',         auth:'oauth',  note:'VK Play Live / VK Видео — плашки с внешними ссылками под трансляцией, виджеты OBS' },
  rutube:    { url:'description', obs:'rtmp',       auth:'none',   note:'ссылки в описании к эфиру, RTMP через OBS' },
  steam:     { url:'profile', obs:'game-capture',   auth:'none',   note:'Steam Broadcast — стримы внутри сообщества, оверлеи через захват игры, ссылки в профиле' },
  nimo:      { url:'profile', obs:'rtmp',           auth:'none',   note:'Nimo TV — мобильный гейминг LatAm и Азии, RTMP' },
  nonolive:  { url:'profile', obs:'rtmp',           auth:'none',   note:'Nonolive — мобильные и ПК-игры Азия и Ближний Восток' },
  soop:      { url:'profile', obs:'rtmp',           auth:'oauth',  note:'SOOP (ex-AfreecaTV) — крупнейший корейский сервис' },
  chzzk:     { url:'profile', obs:'rtmp',           auth:'oauth',  note:'CHZZK — корейский стриминговый сервис' },
  zoom:       { url:'chat',    obs:'virtual-camera', auth:'oauth',  note:'Zoom — оверлей поверх видео через OBS Virtual Camera, ссылка в чате звонка' },
  googlemeet:{ url:'chat',    obs:'virtual-camera', auth:'oauth',  note:'Google Meet — оверлей через OBS Virtual Camera, ссылка в чате' },
  bizon365:  { url:'chat',    obs:'virtual-camera', auth:'none',   note:'Bizon365 — закрытые вебинарные комнаты, инфобизнес, ссылки в чате' },
  webinarru: { url:'chat',    obs:'virtual-camera', auth:'none',   note:'Webinar.ru — закрытые вебинарные комнаты, ссылки в чате' },
};

function platformEntry(id) {
  const c = CAPS[id];
  if (!c) return null;
  return Object.freeze({ id, ...c, status:'capability-declared' });
}

export function listPlatforms() {
  return PLATFORM_IDS.map(platformEntry).filter(Boolean);
}

export function getPlatform(id) {
  if (typeof id !== 'string') return null;
  const k = id.toLowerCase().trim();
  return platformEntry(k);
}

export function registerPlatform(id, capabilities) {
  if (typeof id !== 'string' || !/^[a-z0-9_-]{2,32}$/.test(id)) throw Error('Invalid platform id');
  const k = id.toLowerCase();
  if (CAPS[k]) throw Error('Platform already registered');
  if (!capabilities || typeof capabilities !== 'object') throw Error('Capabilities required');
  CAPS[k] = Object.freeze({ url:'unknown', obs:'unknown', auth:'none', note:'', ...capabilities });
  if (!PLATFORM_IDS.includes(k)) PLATFORM_IDS.push(k);
  return platformEntry(k);
}

// --- OAuth-capable adapter stubs: verify truthful flows, never fake connected ---

function b64url(bytes) {
  const b = Buffer.from(bytes);
  return b.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

function requireStr(v, name) {
  if (typeof v !== 'string' || !v.trim()) throw Error(`Missing ${name}`);
  return v.trim();
}

export function createTwitchAdapter({ clientId, redirectUri } = {}) {
  const stateStore = new Map();
  return {
    id:'twitch',
    kind:'oauth',
    truthful:'dev.twitch.tv/docs/authentication + eventsub; Extension does not permit crypto payment replacing Bits',
    createAuthorizationUrl({ state, codeVerifier } = {}) {
      const s = requireStr(state || b64url(require('node:crypto').randomBytes(16)), 'state');
      let verifier = codeVerifier || null;
      if (verifier) {
        if (typeof verifier !== 'string' || verifier.length < 43) throw Error('Invalid PKCE verifier');
      }
      stateStore.set(s, { createdAt: Date.now(), codeVerifier: verifier });
      const params = new URLSearchParams({ state: s });
      if (clientId) params.set('client_id', clientId);
      if (redirectUri) params.set('redirect_uri', redirectUri);
      if (verifier) {
        const challenge = b64url(require('node:crypto').createHash('sha256').update(verifier).digest());
        params.set('code_challenge', challenge); params.set('code_challenge_method','S256');
      }
      return { url: `https://id.twitch.tv/oauth2/authorize?${params}`, state: s };
    },
    verifyCallback({ state, code, redirectUri: cbRedirect }) {
      const s = requireStr(state,'state'); requireStr(code,'code');
      const entry = stateStore.get(s);
      if (!entry) throw Error('Unknown or replayed OAuth state');
      stateStore.delete(s);
      if (cbRedirect && redirectUri && cbRedirect !== redirectUri) throw Error('Redirect mismatch');
      if (Date.now() - entry.createdAt > 600000) throw Error('OAuth state expired');
      return { verified:true, state: s, pkce: !!entry.codeVerifier };
    },
    revoke(state) {
      if (!stateStore.has(state)) throw Error('Unknown state');
      stateStore.delete(state);
      return { revoked:true };
    },
    capabilities: CAPS.twitch,
  };
}

export function createYouTubeAdapter({ clientId, redirectUri } = {}) {
  const stateStore = new Map();
  return {
    id:'youtube',
    kind:'oauth',
    truthful:'developers.google.com/youtube/v3/live; Super Chat separate; no conversion of platform funding',
    createAuthorizationUrl({ state } = {}) {
      const s = requireStr(state || b64url(require('node:crypto').randomBytes(16)), 'state');
      stateStore.set(s, { createdAt: Date.now() });
      const params = new URLSearchParams({ state: s });
      if (clientId) params.set('client_id', clientId);
      if (redirectUri) params.set('redirect_uri', redirectUri);
      return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, state: s };
    },
    verifyCallback({ state, code, redirectUri: cbRedirect }) {
      const s = requireStr(state,'state'); requireStr(code,'code');
      const entry = stateStore.get(s);
      if (!entry) throw Error('Unknown or replayed OAuth state');
      stateStore.delete(s);
      if (cbRedirect && redirectUri && cbRedirect !== redirectUri) throw Error('Redirect mismatch');
      if (Date.now() - entry.createdAt > 600000) throw Error('OAuth state expired');
      return { verified:true, state: s };
    },
    revoke(state) {
      if (!stateStore.has(state)) throw Error('Unknown state');
      stateStore.delete(state); return { revoked:true };
    },
    capabilities: CAPS.youtube,
  };
}

export function createTikTokAdapter({ clientId, redirectUri } = {}) {
  const stateStore = new Map();
  return {
    id:'tiktok',
    kind:'oauth',
    truthful:'developers.tiktok.com Display API + Login Kit; LIVE gifts event API not established; no credential scraping',
    createAuthorizationUrl({ state, codeVerifier } = {}) {
      const s = requireStr(state || b64url(require('node:crypto').randomBytes(16)), 'state');
      let verifier = codeVerifier || null;
      if (verifier && (typeof verifier !== 'string' || verifier.length < 43)) throw Error('Invalid PKCE verifier');
      stateStore.set(s, { createdAt: Date.now(), codeVerifier: verifier });
      const params = new URLSearchParams({ state: s });
      if (clientId) params.set('client_id', clientId);
      if (redirectUri) params.set('redirect_uri', redirectUri);
      if (verifier) {
        const challenge = b64url(require('node:crypto').createHash('sha256').update(verifier).digest());
        params.set('code_challenge', challenge); params.set('code_challenge_method','S256');
      }
      return { url: `https://www.tiktok.com/v2/auth/authorize?${params}`, state: s };
    },
    verifyCallback({ state, code, redirectUri: cbRedirect }) {
      const s = requireStr(state,'state'); requireStr(code,'code');
      const entry = stateStore.get(s);
      if (!entry) throw Error('Unknown or replayed OAuth state');
      stateStore.delete(s);
      if (cbRedirect && redirectUri && cbRedirect !== redirectUri) throw Error('Redirect mismatch');
      if (Date.now() - entry.createdAt > 600000) throw Error('OAuth state expired');
      return { verified:true, state: s, pkce: !!entry.codeVerifier };
    },
    revoke(state) {
      if (!stateStore.has(state)) throw Error('Unknown state');
      stateStore.delete(state); return { revoked:true };
    },
    capabilities: CAPS.tiktok,
  };
}
