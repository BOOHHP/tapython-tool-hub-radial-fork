import { openHubDatabase } from '../database/hubDatabase.js';
import type { ApiConfig } from '../config/env.js';
import { importSubmissions, verifySubmissions } from './submissionImport.js';

// Usage: node dist/migration/cli.js <import|verify> --sqlite <file> --submissions <dir> [--dry-run] [--inventory <file>]
const [command, ...rest] = process.argv.slice(2);
const flags = new Map<string, string | true>();
for (let i = 0; i < rest.length; i += 1) {
  if (!rest[i].startsWith('--')) {
    continue;
  }
  const next = rest[i + 1];
  if (next === undefined || next.startsWith('--')) {
    flags.set(rest[i], true);
  } else {
    flags.set(rest[i], next);
    i += 1;
  }
}

const sqlite = flags.get('--sqlite');
const submissions = flags.get('--submissions');
if ((command !== 'import' && command !== 'verify') || typeof sqlite !== 'string' || typeof submissions !== 'string') {
  console.error('Usage: cli.js <import|verify> --sqlite <file> --submissions <dir> [--dry-run] [--inventory <file>]');
  process.exit(2);
}

const hub = await openHubDatabase({ sqlitePath: sqlite } as ApiConfig);
try {
  if (command === 'import') {
    const report = importSubmissions(hub!.db, submissions, { dryRun: flags.get('--dry-run') === true });
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.invalid.length > 0 || report.conflicts.length > 0 ? 1 : 0;
  } else {
    const inventory = flags.get('--inventory');
    const report = verifySubmissions(hub!.db, submissions, typeof inventory === 'string' ? inventory : undefined);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.ok ? 0 : 1;
  }
} finally {
  hub!.db.close();
}
