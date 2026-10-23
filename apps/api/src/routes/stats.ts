import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createAdminGuard, type HubAuth } from '../identity/hubAuth.js';
import type { AuthService } from '../services/authService.js';
import type { StatsService } from '../stats/statsService.js';

// Dashboards are for signed-in members; review-process detail is limited to reviewers and admins.
export function registerStatsRoutes(stats: StatsService, hubAuth: HubAuth, authService: AuthService) {
  const guard = createAdminGuard(authService, hubAuth);
  const member = async (request: FastifyRequest, reply: FastifyReply) => {
    if (authService.isConfigured() && authService.readSession(request)) {
      return;
    }
    if (!hubAuth.resolveWithRefresh(request, reply)) {
      return reply.code(401).send({ error: 'login_required' });
    }
  };

  return async function statsRoutes(app: FastifyInstance) {
    app.addHook('onSend', async (_request, reply) => {
      reply.header('Cache-Control', 'no-store');
    });
    app.get('/api/v1/stats/platform', { preHandler: member }, async () => stats.platform());
    app.get('/api/v1/stats/contribution', { preHandler: member }, async () => stats.contribution());
    app.get('/api/v1/stats/process', { preHandler: guard('reviewer') }, async () => stats.process());
  };
}
