import path from 'node:path';
import type { SubmissionRecord } from '@tapython-tool-hub/shared';
import { loadMigrations, migrate } from '../database/migrate.js';
import { openSqlite } from '../database/sqlite.js';

const migrationsDir = path.resolve(import.meta.dirname, '..', '..', 'db', 'sqlite-migrations');

export async function memoryDb() {
  const db = openSqlite(':memory:');
  migrate(db, await loadMigrations(migrationsDir));
  return db;
}

export function sampleRecord(id: string, overrides: Partial<SubmissionRecord> = {}): SubmissionRecord {
  return {
    id,
    slug: 'demo-tool',
    submitter: 'Scene C Team',
    status: 'pending',
    markdown: '# demo',
    assets: [{ path: 'a.py', content: 'print(1)' }],
    notes: undefined,
    validationReport: { valid: true, issues: [] },
    reviews: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}
