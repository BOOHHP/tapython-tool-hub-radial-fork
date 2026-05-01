import { Pool } from 'pg';
import type { ApiConfig } from '../config/env.js';

export interface DatabaseHealth {
  configured: boolean;
  ok: boolean;
  message: string;
}

export function createDatabasePool(config: ApiConfig): Pool | undefined {
  if (!config.databaseUrl) {
    return undefined;
  }

  return new Pool({ connectionString: config.databaseUrl });
}

export async function checkDatabase(pool: Pool | undefined): Promise<DatabaseHealth> {
  if (!pool) {
    return {
      configured: false,
      ok: true,
      message: 'DATABASE_URL is not configured; API is running in static-read mode.'
    };
  }

  try {
    await pool.query('select 1');
    return {
      configured: true,
      ok: true,
      message: 'database reachable'
    };
  } catch (error) {
    return {
      configured: true,
      ok: false,
      message: error instanceof Error ? error.message : 'database check failed'
    };
  }
}