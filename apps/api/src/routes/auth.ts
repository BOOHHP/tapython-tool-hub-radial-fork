import type { FastifyInstance } from 'fastify';
import type { AuthService } from '../services/authService.js';

interface LoginBody {
  username?: string;
  password?: string;
}

export function registerAuthRoutes(authService: AuthService) {
  return async function authRoutes(app: FastifyInstance) {
    app.get('/api/auth/me', async (request, reply) => {
      if (!authService.isConfigured()) {
        return reply.code(503).send({ error: 'admin_auth_not_configured' });
      }
      const session = authService.readSession(request);
      if (!session) {
        return reply.code(401).send({ authenticated: false });
      }
      return { authenticated: true, user: { username: session.username } };
    });

    app.post('/api/auth/login', async (request, reply) => {
      if (!authService.isConfigured()) {
        return reply.code(503).send({ error: 'admin_auth_not_configured' });
      }
      const body = request.body as LoginBody | undefined;
      const username = body?.username?.trim() ?? '';
      const password = body?.password ?? '';
      const verified = await authService.verifyCredentials(username, password);
      if (!verified) {
        return reply.code(401).send({ error: 'invalid_credentials' });
      }
      authService.setSessionCookie(reply, authService.createSession(username));
      return { authenticated: true, user: { username } };
    });

    app.post('/api/auth/logout', async (_, reply) => {
      authService.clearSessionCookie(reply);
      return { authenticated: false };
    });
  };
}