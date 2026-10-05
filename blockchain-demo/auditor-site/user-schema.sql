CREATE TABLE IF NOT EXISTS vidra_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS vidra_users (
 id TEXT PRIMARY KEY, chain_id INTEGER NOT NULL CHECK(chain_id=84532),
 account TEXT NOT NULL UNIQUE CHECK(length(account)=42 AND account=lower(account)),
 display_name TEXT NOT NULL DEFAULT '', locale TEXT NOT NULL DEFAULT 'ru' CHECK(locale IN ('ru','en')),
 revision INTEGER NOT NULL DEFAULT 0, created_at BIGINT NOT NULL, last_auth_at BIGINT
);
CREATE TABLE IF NOT EXISTS vidra_challenges (
 id TEXT PRIMARY KEY, account TEXT NOT NULL, origin TEXT NOT NULL, message TEXT NOT NULL, expires BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS vidra_challenge_owner_expiry ON vidra_challenges(account,expires);
CREATE TABLE IF NOT EXISTS vidra_sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES vidra_users(id), account TEXT NOT NULL,
 origin TEXT NOT NULL, expires BIGINT NOT NULL, created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS vidra_session_owner_expiry ON vidra_sessions(account,expires);
CREATE TABLE IF NOT EXISTS vidra_grants (
 token_hash TEXT PRIMARY KEY, session_hash TEXT NOT NULL REFERENCES vidra_sessions(token_hash) ON DELETE CASCADE,
 account TEXT NOT NULL, exchange_id TEXT NOT NULL, sha256 TEXT NOT NULL, expires BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS vidra_grant_expiry ON vidra_grants(expires);
CREATE TABLE IF NOT EXISTS vidra_rate_limits (key TEXT PRIMARY KEY, window_at BIGINT NOT NULL, count INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS vidra_wallet_locks (account TEXT PRIMARY KEY, token TEXT NOT NULL, expires BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS vidra_market_capacity (
 lane TEXT NOT NULL CHECK(lane IN ('checkout','read')), slot INTEGER NOT NULL,
 token TEXT NOT NULL, expires BIGINT NOT NULL, PRIMARY KEY(lane,slot),
 CHECK(slot>=0 AND ((lane='checkout' AND slot<8) OR (lane='read' AND slot<4)))
);
CREATE TABLE IF NOT EXISTS vidra_wallet_intents (
 id TEXT PRIMARY KEY, account TEXT NOT NULL, operation_key TEXT NOT NULL, status TEXT NOT NULL,
 payload TEXT NOT NULL, UNIQUE(account,operation_key)
);
CREATE INDEX IF NOT EXISTS vidra_intent_owner ON vidra_wallet_intents(account);
CREATE UNIQUE INDEX IF NOT EXISTS vidra_one_active_intent ON vidra_wallet_intents(account) WHERE status IN ('PREPARED','SUBMITTED');
CREATE TABLE IF NOT EXISTS vidra_wallet_orders (
 exchange_id TEXT PRIMARY KEY, account TEXT NOT NULL, payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS vidra_order_owner ON vidra_wallet_orders(account);
