import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const dataDirectory = fileURLToPath(new URL('../data/', import.meta.url))
mkdirSync(dataDirectory, { recursive: true })

export const database = new DatabaseSync(process.env.TECHSTORE_DB_PATH || join(dataDirectory, 'techstore.sqlite'))
database.exec('PRAGMA foreign_keys = ON')
database.exec(`
  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS stores (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
  ) STRICT;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    store_id INTEGER NOT NULL REFERENCES stores(id),
    role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'manager', 'employee', 'auditor')),
    active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
    totp_secret TEXT NOT NULL,
    mfa_enabled INTEGER NOT NULL DEFAULT 0 CHECK (mfa_enabled IN (0, 1)),
    last_totp_step INTEGER NOT NULL DEFAULT -1,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS auth_challenges (
    id INTEGER PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL CHECK (purpose IN ('setup', 'login')),
    attempts INTEGER NOT NULL DEFAULT 0,
    expires_at INTEGER NOT NULL,
    consumed INTEGER NOT NULL DEFAULT 0 CHECK (consumed IN (0, 1))
  ) STRICT;

  CREATE INDEX IF NOT EXISTS idx_auth_challenges_user ON auth_challenges(user_id);

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id),
    sku TEXT NOT NULL COLLATE NOCASE,
    name TEXT NOT NULL,
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (store_id, sku)
  ) STRICT;

  CREATE TABLE IF NOT EXISTS stock_events (
    id INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    delta INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS idx_products_store ON products(store_id);

  CREATE TABLE IF NOT EXISTS oauth_states (
    state_hash TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    code_verifier TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS oauth_identities (
    provider TEXT NOT NULL,
    provider_user_id TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (provider, provider_user_id)
  ) STRICT;

  INSERT OR IGNORE INTO stores (id, name) VALUES (1, 'Tienda de demostración');
`)

if (!database.prepare('PRAGMA table_info(users)').all().some((column) => column.name === 'active')) {
  database.exec('ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1))')
}
database.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('schema_version', '5')").run()
