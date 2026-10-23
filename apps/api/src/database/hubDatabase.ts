import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ApiConfig } from '../config/env.js';
import { currentSchemaVersion, loadMigrations, migrate } from './migrate.js';
import { openSqlite, type SqliteDatabase } from './sqlite.js';

// apps/api/db is a sibling of both src/ and dist/, so the same path works in dev and production.
const defaultMigrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'db', 'sqlite-migrations');

export interface HubDatabase {
  db: SqliteDatabase;
  schemaVersion: number;
}

export async function openHubDatabase(config: ApiConfig, migrationsDir = defaultMigrationsDir): Promise<HubDatabase | undefined> {
  if (!config.sqlitePath) {
    return undefined;
  }

  const db = openSqlite(config.sqlitePath);
  try {
    migrate(db, await loadMigrations(migrationsDir));
    return { db, schemaVersion: currentSchemaVersion(db) };
  } catch (error) {
    db.close();
    throw error;
  }
}
