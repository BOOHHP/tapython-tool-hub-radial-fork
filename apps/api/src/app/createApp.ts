import cors from '@fastify/cors';
import fastify from 'fastify';
import type { ApiConfig } from '../config/env.js';
import { createDatabasePool } from '../database/client.js';
import { StaticToolRepository } from '../repositories/staticToolRepository.js';
import { registerHealthRoutes } from '../routes/health.js';
import { registerToolRoutes } from '../routes/tools.js';

export function createApp(config: ApiConfig) {
  const app = fastify({ logger: true });
  const databasePool = createDatabasePool(config);
  const toolRepository = new StaticToolRepository(config);

  app.register(cors, { origin: true });
  app.register(registerHealthRoutes(databasePool));
  app.register(registerToolRoutes(toolRepository));

  app.addHook('onClose', async () => {
    await databasePool?.end();
  });

  return app;
}