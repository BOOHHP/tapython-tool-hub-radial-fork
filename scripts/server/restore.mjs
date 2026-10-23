// Usage: node scripts/server/restore.mjs --from BACKUP_DIR --yes [--root DIR] [--sqlite FILE]
// Stop the API service first; the replaced database is kept next to the original as *.before-restore-*.
import path from 'node:path';
import { parseArgs } from 'node:util';
import { restoreBackup } from './lib/backup.mjs';

const { values } = parseArgs({
  options: {
    from: { type: 'string' },
    root: { type: 'string' },
    sqlite: { type: 'string' },
    yes: { type: 'boolean', default: false }
  }
});

if (!values.from || !values.yes) {
  console.error('Refusing to restore without --from BACKUP_DIR and --yes (stop the API service first).');
  process.exit(2);
}

const root = path.resolve(values.root ?? path.join(import.meta.dirname, '..', '..'));
const sqlitePath = path.resolve(values.sqlite ?? process.env.SQLITE_PATH ?? path.join(root, '.tapython-tool-hub', 'hub.sqlite'));

const summary = await restoreBackup({ from: path.resolve(values.from), root, sqlitePath });
console.log(`restored ${summary.restoredFiles} files${summary.replacedDatabase ? `; previous database kept at ${summary.replacedDatabase}` : ''}`);
