CREATE TABLE IF NOT EXISTS vidra_members (
 id TEXT PRIMARY KEY, wallet TEXT UNIQUE, display_name TEXT NOT NULL DEFAULT '',
 locale TEXT NOT NULL DEFAULT 'ru' CHECK(locale IN ('ru','en')),
 seller INTEGER NOT NULL DEFAULT 0 CHECK(seller IN (0,1)), revision INTEGER NOT NULL DEFAULT 0,
 created_at BIGINT NOT NULL, CHECK(wallet IS NULL OR (length(wallet)=42 AND wallet=lower(wallet)))
);
CREATE TABLE IF NOT EXISTS vidra_google_identities (
 subject_hash TEXT PRIMARY KEY, member_id TEXT NOT NULL UNIQUE REFERENCES vidra_members(id)
);
CREATE TABLE IF NOT EXISTS vidra_member_sessions (
 token_hash TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES vidra_members(id), origin TEXT NOT NULL, expires BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS vidra_member_session_expiry ON vidra_member_sessions(expires);
CREATE TABLE IF NOT EXISTS vidra_google_flows (
 nonce TEXT PRIMARY KEY, browser_hash TEXT NOT NULL, origin TEXT NOT NULL,
 wallet_session_hash TEXT, expires BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS vidra_seller_products (
 id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES vidra_members(id), revision INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status='DRAFT'), payload TEXT NOT NULL, created_at BIGINT NOT NULL,
 UNIQUE(member_id,id)
);
CREATE INDEX IF NOT EXISTS vidra_seller_product_owner ON vidra_seller_products(member_id);
CREATE TABLE IF NOT EXISTS vidra_seller_assets (
 id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES vidra_members(id),
 sha256 TEXT NOT NULL CHECK(length(sha256)=64), bytes BIGINT NOT NULL CHECK(bytes>0 AND bytes<=67108864),
 mime TEXT NOT NULL, filename TEXT NOT NULL, ready INTEGER NOT NULL DEFAULT 0 CHECK(ready IN (0,1)),
 created_at BIGINT NOT NULL, UNIQUE(member_id,sha256), UNIQUE(member_id,id)
);
CREATE TABLE IF NOT EXISTS vidra_product_assets (
 product_id TEXT PRIMARY KEY REFERENCES vidra_seller_products(id), member_id TEXT NOT NULL REFERENCES vidra_members(id),
 asset_id TEXT NOT NULL REFERENCES vidra_seller_assets(id),
 FOREIGN KEY(member_id,product_id) REFERENCES vidra_seller_products(member_id,id),
 FOREIGN KEY(member_id,asset_id) REFERENCES vidra_seller_assets(member_id,id)
);
CREATE TABLE IF NOT EXISTS vidra_published_offers (
 product_id TEXT PRIMARY KEY REFERENCES vidra_seller_products(id), member_id TEXT NOT NULL REFERENCES vidra_members(id),
 wallet TEXT NOT NULL, offer_id TEXT NOT NULL UNIQUE, seller_id TEXT NOT NULL, revision INTEGER NOT NULL,
 transaction_hash TEXT NOT NULL UNIQUE, block_number BIGINT NOT NULL, payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS vidra_published_owner ON vidra_published_offers(member_id);
CREATE TABLE IF NOT EXISTS vidra_publication_reservations (
 product_id TEXT PRIMARY KEY REFERENCES vidra_seller_products(id), member_id TEXT NOT NULL REFERENCES vidra_members(id),
 wallet TEXT NOT NULL, revision INTEGER NOT NULL, operation_key TEXT NOT NULL,
 FOREIGN KEY(member_id,product_id) REFERENCES vidra_seller_products(member_id,id)
);
