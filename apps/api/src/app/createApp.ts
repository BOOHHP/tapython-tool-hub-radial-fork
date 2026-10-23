import cors from '@fastify/cors';
import fastify from 'fastify';
import type { ApiConfig } from '../config/env.js';
import type { SqliteDatabase } from '../database/sqlite.js';
import { createDatabasePool } from '../database/client.js';
import { openHubDatabase } from '../database/hubDatabase.js';
import { FileSubmissionRepository } from '../repositories/fileSubmissionRepository.js';
import { PgSubmissionRepository } from '../repositories/pgSubmissionRepository.js';
import { SqliteSubmissionRepository } from '../repositories/sqliteSubmissionRepository.js';
import type { SubmissionRepository } from '../repositories/submissionRepository.js';
import { StaticToolRepository } from '../repositories/staticToolRepository.js';
import { registerAdminRoutes } from '../routes/admin.js';
import { registerAdminUserRoutes } from '../routes/adminUsers.js';
import { registerAuthRoutes } from '../routes/auth.js';
import { registerDownloadRoutes } from '../routes/downloads.js';
import { registerHealthRoutes } from '../routes/health.js';
import { registerIdentityRoutes } from '../routes/identity.js';
import { registerEventRoutes } from '../routes/events.js';
import { registerStatsRoutes } from '../routes/stats.js';
import { StatsService } from '../stats/statsService.js';
import { syncToolIndex } from '../catalog/toolIndex.js';
import { EventStore } from '../identity/events.js';
import { createFeishuProvider } from '../auth/feishuProvider.js';
import { AuditLog } from '../identity/auditLog.js';
import { AuthorAliases } from '../identity/authorAliases.js';
import { createAdminGuard, HubAuth } from '../identity/hubAuth.js';
import { SessionService } from '../identity/sessionService.js';
import { UserRepository } from '../identity/userRepository.js';
import { registerSubmissionRoutes } from '../routes/submissions.js';
import { registerToolRoutes } from '../routes/tools.js';
import { AdminWorkflow } from '../services/adminWorkflow.js';
import { AuthService } from '../services/authService.js';
import { SubmissionWorkflow } from '../services/submissionWorkflow.js';
import { registerStaticAssets } from './staticPlugin.js';

export async function createApp(config: ApiConfig) {
  const app = fastify({ logger: true });
  const databasePool = createDatabasePool(config);
  const hubDatabase = await openHubDatabase(config);
  const toolRepository = new StaticToolRepository(config);
  const syncTools = hubDatabase
    ? () => {
        try {
          syncToolIndex(hubDatabase.db, config.toolApiRoot);
        } catch (error) {
          app.log.warn({ err: error }, 'tool index sync failed');
        }
      }
    : undefined;
  const adminWorkflow = new AdminWorkflow(config, syncTools);
  const authService = new AuthService(config);
  let submissionRepository: SubmissionRepository;
  let events: EventStore | undefined;
  let identity: ReturnType<typeof buildIdentity>;
  try {
    if (config.storeBackend === 'sqlite') {
      if (!hubDatabase) {
        throw new Error('STORE_BACKEND=sqlite requires SQLITE_PATH');
      }
      submissionRepository = new SqliteSubmissionRepository(hubDatabase.db);
    } else {
      submissionRepository = databasePool ? new PgSubmissionRepository(databasePool) : new FileSubmissionRepository(config);
    }
    if (config.eventsEnabled) {
      if (!hubDatabase) {
        throw new Error('EVENTS_ENABLED requires SQLITE_PATH');
      }
      events = new EventStore(hubDatabase.db);
    }
    identity = buildIdentity(config, hubDatabase?.db, events, (message, detail) => app.log.warn(detail, message));
  } catch (error) {
    hubDatabase?.db.close();
    await databasePool?.end();
    throw error;
  }
  const submissionWorkflow = new SubmissionWorkflow(config, submissionRepository, syncTools);
  syncTools?.();

  app.register(cors, {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
  });
  app.register(registerHealthRoutes(databasePool, hubDatabase, { auth: Boolean(identity), events: Boolean(events), storeBackend: config.storeBackend === 'sqlite' ? 'sqlite' : 'files' }));
  app.register(registerToolRoutes(toolRepository));
  app.register(registerDownloadRoutes(config, events ? { store: events, hubAuth: identity?.hubAuth } : undefined));
  app.register(registerEventRoutes({ store: events, hubAuth: identity?.hubAuth }));
  app.register(registerSubmissionRoutes(submissionRepository, submissionWorkflow));
  app.register(registerAuthRoutes(authService));
  app.register(registerIdentityRoutes(identity?.routeDeps));
  app.register(registerAdminRoutes(submissionRepository, submissionWorkflow, adminWorkflow, authService, identity?.hubAuth, identity?.audit, hubDatabase ? linkReviewer(hubDatabase.db) : undefined));
  if (identity && hubDatabase) {
    app.register(registerStatsRoutes(new StatsService(hubDatabase.db), identity.hubAuth, authService));
  }
  if (identity) {
    app.register(registerAdminUserRoutes(identity.users, createAdminGuard(authService, identity.hubAuth), new AuthorAliases(hubDatabase!.db)));
  }

  if (config.serveStatic) {
    await registerStaticAssets(app, { root: config.webStaticRoot });
  }

  app.addHook('onClose', async () => {
    hubDatabase?.db.close();
    await databasePool?.end();
  });

  return app;
}
function linkReviewer(db: SqliteDatabase) {
  return (reviewId: string, openId: string) => {
    db.prepare('UPDATE submission_reviews SET reviewer_open_id = ? WHERE review_id = ?').run(openId, reviewId);
  };
}

function buildIdentity(config: ApiConfig, db: SqliteDatabase | undefined, events: EventStore | undefined, warn: (message: string, detail: Record<string, unknown>) => void) {
  if (!config.feishuAuthEnabled) {
    return undefined;
  }
  // Misconfiguration must stop startup instead of silently leaving login half-enabled.
  if (!db) {
    throw new Error('AUTH_FEISHU_ENABLED requires SQLITE_PATH');
  }
  if (!config.authSessionSecret) {
    throw new Error('AUTH_FEISHU_ENABLED requires AUTH_SESSION_SECRET');
  }
  const provider = createFeishuProvider({
    provider: config.feishuProvider,
    host: config.host,
    appId: config.feishuAppId,
    appSecret: config.feishuAppSecret,
    scope: config.feishuScope,
    fetchDepartment: config.feishuFetchDepartment,
    warn
  });
  if (!provider) {
    throw new Error('AUTH_FEISHU_ENABLED requires FEISHU_PROVIDER (real or mock)');
  }
  if (config.feishuProvider === 'real' && !config.publicBaseUrl) {
    throw new Error('FEISHU_PROVIDER=real requires PUBLIC_BASE_URL (the origin registered as the Feishu redirect URL)');
  }
  const publicBaseUrl = (config.publicBaseUrl ?? `http://${config.host}:${config.port}`).replace(/\/+$/, '');
  const users = new UserRepository(db, { bootstrapAdminEmails: config.bootstrapAdminEmails });
  const hubAuth = new HubAuth(new SessionService(db, users, { secret: config.authSessionSecret }), config.authSessionSecret, publicBaseUrl);
  return {
    users,
    hubAuth,
    audit: new AuditLog(db),
    routeDeps: {
      provider,
      users,
      hubAuth,
      events,
      appId: config.feishuAppId,
      authorizeUrl: config.feishuProvider === 'real' ? 'https://accounts.feishu.cn/open-apis/authen/v1/authorize' : undefined,
      scope: config.feishuScope,
      publicBaseUrl
    }
  };
}
