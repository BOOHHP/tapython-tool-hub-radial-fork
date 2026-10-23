import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// Everything the server treats as authoritative. The older repo-relative data dirs stay listed as the pre-artifacts fallback.
export const DEFAULT_INCLUDE = ['.tapython-tool-hub/submissions', '.tapython-tool-hub/artifacts', 'data/tool-docs', 'apps/web/public/downloads'];
export const RETENTION = { deploy: 10, daily: 30 };
export const KINDS = ['deploy', 'daily', 'export'];

export async function createBackup({ root, kind, outDir, sqlitePath, include = DEFAULT_INCLUDE, keep, now = new Date() }) {
  if (!KINDS.includes(kind)) {
    throw new Error(`Unknown backup kind: ${kind}`);
  }

  const dir = await allocateDirectory(path.join(outDir, kind), stamp(now));
  const manifest = { formatVersion: 1, kind, createdAt: now.toISOString(), sqlite: null, files: [] };

  if (sqlitePath && fs.existsSync(sqlitePath)) {
    const target = path.join(dir, 'hub.sqlite');
    const db = new DatabaseSync(sqlitePath);
    try {
      const schemaVersion = readSchemaVersion(db);
      // VACUUM INTO yields a transactionally consistent copy even while the API is writing in WAL mode.
      db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
      manifest.sqlite = { file: 'hub.sqlite', sha256: await sha256File(target), bytes: (await fsp.stat(target)).size, schemaVersion };
    } finally {
      db.close();
    }
  }

  for (const relative of include) {
    const source = path.join(root, relative);
    if (fs.existsSync(source)) {
      await fsp.cp(source, path.join(dir, 'files', relative), { recursive: true });
    }
  }
  for (const file of await listFiles(path.join(dir, 'files'))) {
    const relative = path.relative(dir, file).split(path.sep).join('/');
    manifest.files.push({ path: relative, sha256: await sha256File(file), bytes: (await fsp.stat(file)).size });
  }

  await fsp.writeFile(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const limit = keep ?? RETENTION[kind];
  const pruned = limit ? await pruneBackups(outDir, kind, limit) : [];
  return { dir, manifest, pruned };
}

export async function pruneBackups(outDir, kind, keep) {
  const kindDir = path.join(outDir, kind);
  if (!fs.existsSync(kindDir)) {
    return [];
  }
  const names = (await fsp.readdir(kindDir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const doomed = names.slice(0, Math.max(0, names.length - keep));
  for (const name of doomed) {
    await fsp.rm(path.join(kindDir, name), { recursive: true, force: true });
  }
  return doomed.map((name) => path.join(kindDir, name));
}

export async function verifyBackup(dir) {
  const problems = [];
  let manifest;
  try {
    manifest = JSON.parse(await fsp.readFile(path.join(dir, 'manifest.json'), 'utf8'));
  } catch (error) {
    return { ok: false, problems: [`manifest unreadable: ${error.message}`] };
  }

  const entries = [...manifest.files];
  if (manifest.sqlite) {
    entries.push({ path: manifest.sqlite.file, sha256: manifest.sqlite.sha256 });
  }
  for (const entry of entries) {
    if (!isSafeEntry(entry.path)) {
      problems.push(`unsafe path: ${entry.path}`);
      continue;
    }
    const file = path.join(dir, ...entry.path.split('/'));
    if (!fs.existsSync(file)) {
      problems.push(`missing: ${entry.path}`);
    } else if ((await sha256File(file)) !== entry.sha256) {
      problems.push(`checksum mismatch: ${entry.path}`);
    }
  }
  return { ok: problems.length === 0, problems };
}

export async function restoreBackup({ from, root, sqlitePath, now = new Date() }) {
  const verdict = await verifyBackup(from);
  if (!verdict.ok) {
    throw new Error(`Backup verification failed: ${verdict.problems.join('; ')}`);
  }
  const manifest = JSON.parse(await fsp.readFile(path.join(from, 'manifest.json'), 'utf8'));

  let replacedDatabase = null;
  if (manifest.sqlite) {
    if (!sqlitePath) {
      throw new Error('Backup contains a database but no sqlitePath was given');
    }
    if (fs.existsSync(sqlitePath)) {
      replacedDatabase = `${sqlitePath}.before-restore-${stamp(now)}`;
      await fsp.rename(sqlitePath, replacedDatabase);
    }
    for (const suffix of ['-wal', '-shm']) {
      await fsp.rm(`${sqlitePath}${suffix}`, { force: true });
    }
    await fsp.mkdir(path.dirname(sqlitePath), { recursive: true });
    await fsp.copyFile(path.join(from, manifest.sqlite.file), sqlitePath);
  }

  const resolvedRoot = path.resolve(root);
  for (const entry of manifest.files) {
    const relative = entry.path.slice('files/'.length);
    const target = path.resolve(resolvedRoot, ...relative.split('/'));
    if (target !== resolvedRoot && !target.startsWith(resolvedRoot + path.sep)) {
      throw new Error(`Refusing to restore outside root: ${entry.path}`);
    }
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.copyFile(path.join(from, ...entry.path.split('/')), target);
  }
  return { restoredFiles: manifest.files.length, replacedDatabase };
}

function isSafeEntry(entryPath) {
  if (typeof entryPath !== 'string' || path.isAbsolute(entryPath) || entryPath.includes('\\')) {
    return false;
  }
  const segments = entryPath.split('/');
  return !segments.includes('..') && !segments.includes('') && (entryPath === 'hub.sqlite' || segments[0] === 'files');
}

function stamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
}

async function allocateDirectory(parent, base) {
  await fsp.mkdir(parent, { recursive: true });
  for (let attempt = 0; ; attempt += 1) {
    const candidate = path.join(parent, attempt === 0 ? base : `${base}-${attempt}`);
    try {
      await fsp.mkdir(candidate);
      return candidate;
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }
}

function readSchemaVersion(db) {
  try {
    const row = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get();
    return row?.version === null || row?.version === undefined ? null : Number(row.version);
  } catch {
    return null;
  }
}

async function listFiles(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }
  const result = [];
  for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await listFiles(full)));
    } else {
      result.push(full);
    }
  }
  return result;
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    fs.createReadStream(file).on('data', (chunk) => hash.update(chunk)).on('error', reject).on('end', () => resolve(hash.digest('hex')));
  });
}
