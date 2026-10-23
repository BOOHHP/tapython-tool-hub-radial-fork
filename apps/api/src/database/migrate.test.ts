import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadMigrations, migrate, type Migration } from './migrate.js';
import { openSqlite } from './sqlite.js';

const m1: Migration = { version: 1, name: 'create_a', sql: 'CREATE TABLE a (id INTEGER PRIMARY KEY, v TEXT);' };
const m2: Migration = { version: 2, name: 'create_b', sql: 'CREATE TABLE b (id INTEGER PRIMARY KEY, a_id INTEGER REFERENCES a(id));' };

test('applies pending migrations in order and is idempotent', () => {
  const db = openSqlite(':memory:');
  assert.deepEqual(migrate(db, [m2, m1]).applied, [1, 2]);
  assert.deepEqual(migrate(db, [m1, m2]).applied, []);

  const rows = db.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all();
  assert.deepEqual(rows.map((r) => ({ ...r })), [
    { version: 1, name: 'create_a' },
    { version: 2, name: 'create_b' }
  ]);
  db.close();
});

test('applies only the new migrations when the schema is already partly migrated', () => {
  const db = openSqlite(':memory:');
  migrate(db, [m1]);
  assert.deepEqual(migrate(db, [m1, m2]).applied, [2]);
  db.close();
});

test('refuses to run when an applied migration was edited', () => {
  const db = openSqlite(':memory:');
  migrate(db, [m1]);
  assert.throws(
    () => migrate(db, [{ ...m1, sql: 'CREATE TABLE a (id INTEGER PRIMARY KEY, v TEXT, extra TEXT);' }]),
    /checksum/i
  );
  db.close();
});

test('a failing migration rolls back completely and is not recorded', () => {
  const db = openSqlite(':memory:');
  const bad: Migration = { version: 2, name: 'bad', sql: 'CREATE TABLE c (id INTEGER); INSERT INTO missing_table VALUES (1);' };
  assert.throws(() => migrate(db, [m1, bad]));

  const versions = db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version);
  assert.deepEqual(versions, [1]);
  const tableC = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='c'").get();
  assert.equal(tableC, undefined);
  db.close();
});

test('rejects duplicate or non-positive versions', () => {
  const db = openSqlite(':memory:');
  assert.throws(() => migrate(db, [m1, { ...m2, version: 1 }]), /duplicate/i);
  assert.throws(() => migrate(db, [{ ...m1, version: 0 }]), /version/i);
  db.close();
});

test('checksum ignores line-ending differences between Windows and Linux checkouts', () => {
  const db = openSqlite(':memory:');
  migrate(db, [{ version: 1, name: 'crlf', sql: 'CREATE TABLE t (\n  id INTEGER\n);' }]);
  assert.deepEqual(migrate(db, [{ version: 1, name: 'crlf', sql: 'CREATE TABLE t (\r\n  id INTEGER\r\n);' }]).applied, []);
  db.close();
});

test('loadMigrations reads NNN_name.sql files sorted by version', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tapython-migrations-'));
  try {
    await fs.writeFile(path.join(dir, '002_second.sql'), 'SELECT 2;');
    await fs.writeFile(path.join(dir, '001_first.sql'), 'SELECT 1;');
    await fs.writeFile(path.join(dir, 'README.md'), 'ignored');

    const migrations = await loadMigrations(dir);
    assert.deepEqual(migrations.map((m) => [m.version, m.name]), [[1, 'first'], [2, 'second']]);

    await fs.writeFile(path.join(dir, '003 bad name.sql'), 'SELECT 3;');
    await assert.rejects(() => loadMigrations(dir), /migration file name/i);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('openSqlite enables WAL, foreign keys and creates parent directories', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tapython-sqlite-'));
  const file = path.join(dir, 'nested', 'hub.sqlite');
  const db = openSqlite(file);
  try {
    assert.equal(db.prepare('PRAGMA journal_mode').get()?.journal_mode, 'wal');
    assert.equal(db.prepare('PRAGMA foreign_keys').get()?.foreign_keys, 1);
  } finally {
    db.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
