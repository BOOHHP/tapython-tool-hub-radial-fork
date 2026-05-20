import cors from '@fastify/cors';
import fastify from 'fastify';
import type { ApiConfig } from '../config/env.js';
import { createDatabasePool } from '../database/client.js';
import { FileSubmissionRepository } from '../repositories/fileSubmissionRepository.js';
import { PgSubmissionRepository } from '../repositories/pgSubmissionRepository.js';
import { StaticToolRepository } from '../repositories/staticToolRepository.js';
import { registerAdminRoutes } from '../routes/admin.js';
import { registerAuthRoutes } from '../routes/auth.js';
import { registerDownloadRoutes } from '../routes/downloads.js';
import { registerHealthRoutes } from '../routes/health.js';
import { registerSubmissionRoutes } from '../routes/submissions.js';
import { registerToolRoutes } from '../routes/tools.js';
import { AdminWorkflow } from '../services/adminWorkflow.js';
import { AuthService } from '../services/authService.js';
import { SubmissionWorkflow } from '../services/submissionWorkflow.js';
import { registerStaticAssets } from './staticPlugin.js';

export async function createApp(config: ApiConfig) {
  const app = fastify({ logger: true });
  const databasePool = createDatabasePool(config);
  const toolRepository = new StaticToolRepository(config);
  const submissionRepository = databasePool
    ? new PgSubmissionRepository(databasePool)
    : new FileSubmissionRepository(config);
  const submissionWorkflow = new SubmissionWorkflow(config, submissionRepository);
  const adminWorkflow = new AdminWorkflow(config);
  const authService = new AuthService(config);

  app.register(cors, {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
  });
  app.register(registerHealthRoutes(databasePool));
  app.register(registerToolRoutes(toolRepository));
  app.register(registerDownloadRoutes(config));
  app.register(registerSubmissionRoutes(submissionRepository, submissionWorkflow));
  app.register(registerAuthRoutes(authService));
  app.register(registerAdminRoutes(submissionRepository, submissionWorkflow, adminWorkflow, authService));

  if (config.serveStatic) {
    await registerStaticAssets(app, { root: config.webStaticRoot });
  }

  app.addHook('onClose', async () => {
    await databasePool?.end();
  });

  return app;
}