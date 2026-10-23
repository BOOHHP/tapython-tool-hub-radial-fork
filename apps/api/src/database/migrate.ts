import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { SqliteDatabase } from './sqlite.js';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export interface MigrationResult {
  applied: number[];
}

const migrationFilePattern = /^(\d{3,})_([a-z0-9_]+)\.sql$/;

export async function loadMigrations(directory: string): Promise<Migration[]> {
  const entries = (await fs.readdir(directory)).filter((entry) => entry.endsWith('.sql'));
  const migrations: Migration[] = [];
  for (const entry of entries) {
    const match = migrationFilePattern.exec(entry);
    if (!match) {
      throw new Error(`Invalid migration file name: ${entry} (expected NNN_name.sql)`);
    }
    migrations.push({
      version: Number(match[1]),
      name: match[2],
      sql: await fs.readFile(path.join(directory, entry), 'utf8')
    });
  }
  return migrations.sort((a, b) => a.version - b.version);
}

export function migrate(db: SqliteDatabase, migrations: Migration[]): MigrationResult {
  const ordered = validate(migrations);
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);

  const appliedChecksums = new Map<number, string>();
  for (const row of db.prepare('SELECT version, checksum FROM schema_migrations').all()) {
    appliedChecksums.set(Number(row.version), String(row.checksum));
  }

  const applied: number[] = [];
  for (const migration of ordered) {
    const checksum = checksumOf(migration.sql);
    const previous = appliedChecksums.get(migration.version);
    if (previous !== undefined) {
      if (previous !== checksum) {
        throw new Error(`Checksum mismatch for applied migration ${migration.version}_${migration.name}; applied migrations are immutable`);
      }
      continue;
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)')
        .run(migration.version, migration.name, checksum, new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    applied.push(migration.version);
  }
  return { applied };
}

export function currentSchemaVersion(db: SqliteDatabase): number {
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get();
  if (!table) {
    return 0;
  }
  const row = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get();
  return Number(row?.version ?? 0);
}

function validate(migrations: Migration[]): Migration[] {
  const seen = new Set<number>();
  for (const migration of migrations) {
    if (!Number.isInteger(migration.version) || migration.version < 1) {
      throw new Error(`Invalid migration version: ${migration.version}`);
    }
    if (seen.has(migration.version)) {
      throw new Error(`Duplicate migration version: ${migration.version}`);
    }
    seen.add(migration.version);
  }
  return [...migrations].sort((a, b) => a.version - b.version);
}

function checksumOf(sql: string): string {
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
}
