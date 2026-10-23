// Usage: node scripts/server/backup.mjs --kind deploy|daily|export [--root DIR] [--sqlite FILE] [--out DIR] [--keep N]
//        node scripts/server/backup.mjs --verify BACKUP_DIR
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createBackup, KINDS, verifyBackup } from './lib/backup.mjs';

const { values } = parseArgs({
  options: {
    kind: { type: 'string' },
    root: { type: 'string' },
    sqlite: { type: 'string' },
    out: { type: 'string' },
    keep: { type: 'string' },
    verify: { type: 'string' }
  }
});

if (values.verify) {
  const verdict = await verifyBackup(values.verify);
  console.log(verdict.ok ? `OK ${values.verify}` : `FAILED ${values.verify}\n${verdict.problems.join('\n')}`);
  process.exit(verdict.ok ? 0 : 1);
}

if (!KINDS.includes(values.kind)) {
  console.error(`--kind must be one of: ${KINDS.join(', ')}`);
  process.exit(2);
}

const root = path.resolve(values.root ?? path.join(import.meta.dirname, '..', '..'));
const env = readEnvFile(path.join(root, '.env'));
const sqlitePath = values.sqlite ?? process.env.SQLITE_PATH ?? env.SQLITE_PATH ?? path.join(root, '.tapython-tool-hub', 'hub.sqlite');
const outDir = values.out ?? process.env.BACKUP_ROOT ?? env.BACKUP_ROOT ?? path.join(root, '..', 'deploy-backups', path.basename(root));

const result = await createBackup({
  root,
  kind: values.kind,
  outDir: path.resolve(outDir),
  sqlitePath: path.resolve(sqlitePath),
  keep: values.keep ? Number(values.keep) : undefined
});

const verdict = await verifyBackup(result.dir);
if (!verdict.ok) {
  console.error(`Backup written but failed verification: ${verdict.problems.join('; ')}`);
  process.exit(1);
}
console.log(`backup ${values.kind} -> ${result.dir} (${result.manifest.files.length} files, sqlite=${result.manifest.sqlite ? 'yes' : 'no'}, pruned ${result.pruned.length})`);

function readEnvFile(file) {
  const values = {};
  if (!fs.existsSync(file)) {
    return values;
  }
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (match && !line.trim().startsWith('#')) {
      values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  return values;
}
