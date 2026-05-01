import cors from '@fastify/cors';
import fastify from 'fastify';
import type { ApiConfig } from '../config/env.js';
import { createDatabasePool } from '../database/client.js';
import { FileSubmissionRepository } from '../repositories/fileSubmissionRepository.js';
import { PgSubmissionRepository } from '../repositories/pgSubmissionRepository.js';
import { StaticToolRepository } from '../repositories/staticToolRepository.js';
import { registerHealthRoutes } from '../routes/health.js';
import { registerSubmissionRoutes } from '../routes/submissions.js';
import { registerToolRoutes } from '../routes/tools.js';
import { SubmissionWorkflow } from '../services/submissionWorkflow.js';

export function createApp(config: ApiConfig) {
  const app = fastify({ logger: true });
  const databasePool = createDatabasePool(config);
  const toolRepository = new StaticToolRepository(config);
  const submissionRepository = databasePool
    ? new PgSubmissionRepository(databasePool)
    : new FileSubmissionRepository(config);
  const submissionWorkflow = new SubmissionWorkflow(config, submissionRepository);

  app.register(cors, { origin: true });
  app.register(registerHealthRoutes(databasePool));
  app.register(registerToolRoutes(toolRepository));
  app.register(registerSubmissionRoutes(submissionRepository, submissionWorkflow));

  app.addHook('onClose', async () => {
    await databasePool?.end();
  });

  return app;
}