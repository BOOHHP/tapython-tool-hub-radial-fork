import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { checkDatabase } from '../database/client.js';

export function registerHealthRoutes(pool: Pool | undefined) {
  return async function healthRoutes(app: FastifyInstance) {
    const handler = async () => {
      const database = await checkDatabase(pool);
      return {
        status: database.ok ? 'ok' : 'degraded',
        service: 'tapython-tool-hub-api',
        uptime: Math.round(process.uptime()),
        database
      };
    };

    app.get('/health', handler);
    app.get('/api/health', handler);
  };
}