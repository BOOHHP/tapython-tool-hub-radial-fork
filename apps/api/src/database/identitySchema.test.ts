import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadMigrations, migrate } from './migrate.js';
import { openSqlite } from './sqlite.js';

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'db', 'sqlite-migrations');

async function freshDb() {
  const db = openSqlite(':memory:');
  migrate(db, await loadMigrations(migrationsDir));
  return db;
}

const now = '2026-10-23T00:00:00.000Z';

test('shipped migrations apply cleanly and create the identity and event tables', async () => {
  const db = await freshDb();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => String(r.name));
  for (const table of ['users', 'user_roles', 'sessions', 'devices', 'events', 'audit_log', 'hub_meta', 'schema_migrations']) {
    assert.ok(tables.includes(table), `missing table ${table}`);
  }
  db.close();
});

test('emails are unique ignoring case, but several users may have no email', async () => {
  const db = await freshDb();
  const insert = db.prepare('INSERT INTO users (open_id, name, email, created_at) VALUES (?, ?, ?, ?)');
  insert.run('ou_1', 'A', 'Alice@Example.com', now);
  assert.throws(() => insert.run('ou_2', 'B', 'alice@example.com', now), /UNIQUE/);
  insert.run('ou_3', 'C', null, now);
  insert.run('ou_4', 'D', null, now);
  db.close();
});

test('only reviewer and admin roles can be stored, and roles go away with the user', async () => {
  const db = await freshDb();
  db.prepare('INSERT INTO users (open_id, name, created_at) VALUES (?, ?, ?)').run('ou_1', 'A', now);
  const grant = db.prepare('INSERT INTO user_roles (open_id, role, granted_by, granted_at) VALUES (?, ?, ?, ?)');
  grant.run('ou_1', 'admin', 'bootstrap', now);
  assert.throws(() => grant.run('ou_1', 'member', 'bootstrap', now), /CHECK/);

  db.prepare('DELETE FROM users WHERE open_id = ?').run('ou_1');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM user_roles').get()?.n, 0);
  db.close();
});

test('events are idempotent by event_id and keep history when a user is removed', async () => {
  const db = await freshDb();
  db.prepare('INSERT INTO users (open_id, name, created_at) VALUES (?, ?, ?)').run('ou_1', 'A', now);
  // ON CONFLICT(event_id) only swallows duplicates; INSERT OR IGNORE would also hide CHECK violations.
  const insert = db.prepare('INSERT INTO events (event_id, type, at, open_id, device_id, slug, source) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(event_id) DO NOTHING');
  insert.run('e1', 'download', now, 'ou_1', 'dev-1', 'tool-a', 'server');
  insert.run('e1', 'download', now, 'ou_1', 'dev-1', 'tool-a', 'server');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM events').get()?.n, 1);
  assert.throws(() => insert.run('e2', 'download', now, null, 'dev-1', 'tool-a', 'bogus'), /CHECK/);

  db.prepare('DELETE FROM users WHERE open_id = ?').run('ou_1');
  const row = db.prepare('SELECT open_id FROM events WHERE event_id = ?').get('e1');
  assert.equal(row?.open_id, null);
  db.close();
});

test('sessions only accept known clients and cascade with the user', async () => {
  const db = await freshDb();
  db.prepare('INSERT INTO users (open_id, name, created_at) VALUES (?, ?, ?)').run('ou_1', 'A', now);
  const insert = db.prepare('INSERT INTO sessions (id, open_id, refresh_hash, client, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)');
  insert.run('s1', 'ou_1', 'h1', 'installer', now, now);
  assert.throws(() => insert.run('s2', 'ou_1', 'h2', 'toaster', now, now), /CHECK/);
  assert.throws(() => insert.run('s3', 'ou_1', 'h1', 'web', now, now), /UNIQUE/);
  db.prepare('DELETE FROM users WHERE open_id = ?').run('ou_1');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions').get()?.n, 0);
  db.close();
});
