import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { checkDatabase } from '../database/client.js';
import type { HubDatabase } from '../database/hubDatabase.js';

export interface HealthFeatures {
  auth: boolean;
  events: boolean;
}

export function registerHealthRoutes(pool: Pool | undefined, hubDatabase?: HubDatabase, features?: HealthFeatures) {
  return async function healthRoutes(app: FastifyInstance) {
    const handler = async () => {
      const database = await checkDatabase(pool);
      return {
        status: database.ok ? 'ok' : 'degraded',
        service: 'tapython-tool-hub-api',
        uptime: Math.round(process.uptime()),
        database,
        ...(hubDatabase ? { sqlite: { configured: true, ok: true, schemaVersion: hubDatabase.schemaVersion } } : {}),
        ...(features ? { features } : {})
      };
    };

    app.get('/health', handler);
    app.get('/api/health', handler);
  };
}