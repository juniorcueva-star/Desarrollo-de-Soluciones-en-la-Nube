import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const dataDirectory = fileURLToPath(new URL('../data/', import.meta.url))
mkdirSync(dataDirectory, { recursive: true })

export const database = new DatabaseSync(join(dataDirectory, 'techstore.sqlite'))
database.exec('PRAGMA foreign_keys = ON')
database.exec(`
  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  ) STRICT;
  INSERT OR IGNORE INTO app_meta (key, value) VALUES ('schema_version', '1');
`)
