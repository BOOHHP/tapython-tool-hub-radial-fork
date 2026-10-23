import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createBackup, pruneBackups, restoreBackup, verifyBackup } from './lib/backup.mjs';

async function makeRoot() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'tapython-backup-'));
  const root = path.join(base, 'hub');
  await fs.mkdir(path.join(root, 'data', 'tool-docs', 'demo'), { recursive: true });
  await fs.mkdir(path.join(root, 'apps', 'web', 'public', 'downloads', 'demo', '1.0.0'), { recursive: true });
  await fs.mkdir(path.join(root, '.tapython-tool-hub', 'submissions'), { recursive: true });
  await fs.writeFile(path.join(root, 'data', 'tool-docs', 'demo', 'demo.md'), '# demo\n');
  await fs.writeFile(path.join(root, 'apps', 'web', 'public', 'downloads', 'demo', '1.0.0', 'demo.zip'), 'PK-binary');
  await fs.writeFile(path.join(root, '.tapython-tool-hub', 'submissions', 's1.json'), '{"id":"s1"}');
  return { base, root, out: path.join(base, 'backups'), sqlitePath: path.join(root, '.tapython-tool-hub', 'hub.sqlite') };
}

function seedSqlite(file, rows) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('CREATE TABLE IF NOT EXISTS hub_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT, checksum TEXT, applied_at TEXT)');
  db.exec("INSERT OR REPLACE INTO schema_migrations VALUES (1, 'baseline', 'x', 'now')");
  for (const [key, value] of rows) {
    db.prepare('INSERT OR REPLACE INTO hub_meta (key, value) VALUES (?, ?)').run(key, value);
  }
  return db;
}

test('backs up a live WAL database consistently together with the data directories', async () => {
  const ctx = await makeRoot();
  const live = seedSqlite(ctx.sqlitePath, [['a', '1'], ['b', '2']]); // left open on purpose: rows still sit in the WAL
  try {
    const result = await createBackup({ root: ctx.root, kind: 'deploy', outDir: ctx.out, sqlitePath: ctx.sqlitePath });

    const copy = new DatabaseSync(path.join(result.dir, 'hub.sqlite'), { readOnly: true });
    assert.deepEqual(copy.prepare('SELECT key, value FROM hub_meta ORDER BY key').all().map((r) => ({ ...r })), [
      { key: 'a', value: '1' },
      { key: 'b', value: '2' }
    ]);
    copy.close();

    assert.equal(result.manifest.kind, 'deploy');
    assert.equal(result.manifest.sqlite.schemaVersion, 1);
    const paths = result.manifest.files.map((f) => f.path).sort();
    assert.deepEqual(paths, [
      'files/.tapython-tool-hub/submissions/s1.json',
      'files/apps/web/public/downloads/demo/1.0.0/demo.zip',
      'files/data/tool-docs/demo/demo.md'
    ]);
    assert.deepEqual(await verifyBackup(result.dir), { ok: true, problems: [] });
  } finally {
    live.close();
    await fs.rm(ctx.base, { recursive: true, force: true });
  }
});

test('works before SQLite exists (phase 0 servers) and records that', async () => {
  const ctx = await makeRoot();
  try {
    const result = await createBackup({ root: ctx.root, kind: 'daily', outDir: ctx.out, sqlitePath: ctx.sqlitePath });
    assert.equal(result.manifest.sqlite, null);
    assert.equal(result.manifest.files.length, 3);
  } finally {
    await fs.rm(ctx.base, { recursive: true, force: true });
  }
});

test('verify detects a tampered or missing file', async () => {
  const ctx = await makeRoot();
  try {
    const result = await createBackup({ root: ctx.root, kind: 'daily', outDir: ctx.out, sqlitePath: ctx.sqlitePath });
    await fs.writeFile(path.join(result.dir, 'files', 'data', 'tool-docs', 'demo', 'demo.md'), 'tampered');
    await fs.rm(path.join(result.dir, 'files', '.tapython-tool-hub', 'submissions', 's1.json'));
    const verdict = await verifyBackup(result.dir);
    assert.equal(verdict.ok, false);
    assert.equal(verdict.problems.length, 2);
  } finally {
    await fs.rm(ctx.base, { recursive: true, force: true });
  }
});

test('keeps only the newest N backups of the same kind and leaves other kinds alone', async () => {
  const ctx = await makeRoot();
  try {
    for (let i = 0; i < 4; i += 1) {
      await createBackup({ root: ctx.root, kind: 'deploy', outDir: ctx.out, sqlitePath: ctx.sqlitePath, keep: 100, now: new Date(Date.UTC(2026, 9, 20 + i, 1, 0, 0)) });
    }
    await createBackup({ root: ctx.root, kind: 'daily', outDir: ctx.out, sqlitePath: ctx.sqlitePath, now: new Date(Date.UTC(2026, 9, 19, 1, 0, 0)) });

    const pruned = await pruneBackups(ctx.out, 'deploy', 2);
    assert.equal(pruned.length, 2);
    assert.deepEqual((await fs.readdir(path.join(ctx.out, 'deploy'))).sort(), ['20261022-010000', '20261023-010000']);
    assert.equal((await fs.readdir(path.join(ctx.out, 'daily'))).length, 1);
  } finally {
    await fs.rm(ctx.base, { recursive: true, force: true });
  }
});

test('two backups in the same second do not overwrite each other', async () => {
  const ctx = await makeRoot();
  try {
    const now = new Date(Date.UTC(2026, 9, 23, 1, 0, 0));
    const a = await createBackup({ root: ctx.root, kind: 'deploy', outDir: ctx.out, sqlitePath: ctx.sqlitePath, now });
    const b = await createBackup({ root: ctx.root, kind: 'deploy', outDir: ctx.out, sqlitePath: ctx.sqlitePath, now });
    assert.notEqual(a.dir, b.dir);
  } finally {
    await fs.rm(ctx.base, { recursive: true, force: true });
  }
});

test('restore brings back data and the database, keeping the replaced database aside', async () => {
  const ctx = await makeRoot();
  const live = seedSqlite(ctx.sqlitePath, [['a', '1']]);
  try {
    const result = await createBackup({ root: ctx.root, kind: 'deploy', outDir: ctx.out, sqlitePath: ctx.sqlitePath });
    live.exec("INSERT OR REPLACE INTO hub_meta VALUES ('a', 'changed')");
    live.exec("INSERT INTO hub_meta VALUES ('extra', 'x')");
    live.close();
    await fs.writeFile(path.join(ctx.root, 'data', 'tool-docs', 'demo', 'demo.md'), 'damaged');
    await fs.rm(path.join(ctx.root, 'apps', 'web', 'public', 'downloads'), { recursive: true });

    const summary = await restoreBackup({ from: result.dir, root: ctx.root, sqlitePath: ctx.sqlitePath, now: new Date(Date.UTC(2026, 9, 23, 2, 0, 0)) });

    assert.equal(await fs.readFile(path.join(ctx.root, 'data', 'tool-docs', 'demo', 'demo.md'), 'utf8'), '# demo\n');
    assert.equal(await fs.readFile(path.join(ctx.root, 'apps', 'web', 'public', 'downloads', 'demo', '1.0.0', 'demo.zip'), 'utf8'), 'PK-binary');

    const restored = new DatabaseSync(ctx.sqlitePath, { readOnly: true });
    assert.deepEqual(restored.prepare('SELECT key, value FROM hub_meta').all().map((r) => ({ ...r })), [{ key: 'a', value: '1' }]);
    restored.close();

    assert.ok(summary.replacedDatabase);
    await fs.access(summary.replacedDatabase);
  } finally {
    await fs.rm(ctx.base, { recursive: true, force: true });
  }
});

test('restore refuses a corrupted backup and manifests that escape the root', async () => {
  const ctx = await makeRoot();
  try {
    const result = await createBackup({ root: ctx.root, kind: 'deploy', outDir: ctx.out, sqlitePath: ctx.sqlitePath });

    const manifestPath = path.join(result.dir, 'manifest.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    manifest.files[0].path = 'files/../../escape.txt';
    await fs.writeFile(manifestPath, JSON.stringify(manifest));
    await assert.rejects(() => restoreBackup({ from: result.dir, root: ctx.root, sqlitePath: ctx.sqlitePath }), /unsafe|verify|escape/i);

    const second = await createBackup({ root: ctx.root, kind: 'deploy', outDir: ctx.out, sqlitePath: ctx.sqlitePath });
    await fs.writeFile(path.join(second.dir, 'files', 'data', 'tool-docs', 'demo', 'demo.md'), 'tampered');
    await assert.rejects(() => restoreBackup({ from: second.dir, root: ctx.root, sqlitePath: ctx.sqlitePath }), /verif/i);
  } finally {
    await fs.rm(ctx.base, { recursive: true, force: true });
  }
});
