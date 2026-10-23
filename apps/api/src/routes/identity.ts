import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { FeishuAuthError, type FeishuProvider } from '../auth/feishuProvider.js';
import { type HubAuth, parseCookies, refreshCookie, safeReturnTo } from '../identity/hubAuth.js';
import { type EventStore, idPattern } from '../identity/events.js';
import { RateLimiter } from '../identity/rateLimiter.js';
import type { SessionClient } from '../identity/sessionService.js';
import { EmailConflictError, type UserRecord, type UserRepository, UserDisabledError } from '../identity/userRepository.js';

export interface IdentityDeps {
  provider: FeishuProvider;
  users: UserRepository;
  hubAuth: HubAuth;
  events?: EventStore;
  appId?: string;
  authorizeUrl?: string;
  scope?: string;
  publicBaseUrl: string;
}

const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);
const verifierPattern = /^[A-Za-z0-9\-._~]{43,128}$/;

export function publicUser(user: UserRecord) {
  return { openId: user.openId, name: user.name, email: user.email, department: user.department, team: user.team, roles: user.roles };
}

// Native clients receive the code on a loopback listener, so only loopback redirect URIs are acceptable.
export function isLoopbackRedirect(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && loopbackHosts.has(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function sameOrigin(request: FastifyRequest): boolean {
  const origin = request.headers.origin;
  if (!origin) {
    return true;
  }
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

function failureStatus(error: unknown): { status: number; code: string } {
  if (error instanceof FeishuAuthError) {
    return error.code === 'invalid_code' ? { status: 400, code: 'invalid_code' } : { status: 502, code: 'feishu_unavailable' };
  }
  if (error instanceof UserDisabledError) {
    return { status: 403, code: 'account_disabled' };
  }
  if (error instanceof EmailConflictError) {
    return { status: 409, code: 'email_conflict' };
  }
  throw error;
}

export function registerIdentityRoutes(deps?: IdentityDeps) {
  return async function identityRoutes(app: FastifyInstance) {
    app.get('/api/v1/auth/config', async () => {
      if (!deps) {
        return { enabled: false };
      }
      return { enabled: true, appId: deps.appId, authorizeUrl: deps.authorizeUrl, scope: deps.scope };
    });

    if (!deps) {
      return;
    }
    const { provider, users, hubAuth, publicBaseUrl } = deps;
    const webRedirectUri = `${publicBaseUrl}/api/v1/auth/feishu/callback`;
    const limiter = new RateLimiter(30, 60_000);
    const limited = async (request: FastifyRequest, reply: FastifyReply) => {
      if (!limiter.allow(request.ip)) {
        return reply.code(429).send({ error: 'rate_limited' });
      }
    };

    app.get<{ Querystring: { returnTo?: string } }>('/api/v1/auth/feishu/login', { preHandler: limited }, async (request, reply) => {
      const { state, cookie } = hubAuth.createState(safeReturnTo(request.query.returnTo));
      reply.header('Set-Cookie', cookie);
      return reply.redirect(provider.buildAuthorizeUrl(state, webRedirectUri));
    });

    app.get<{ Querystring: { code?: string; state?: string; error?: string } }>('/api/v1/auth/feishu/callback', { preHandler: limited }, async (request, reply) => {
      const pending = hubAuth.consumeState(request, request.query.state);
      reply.header('Set-Cookie', hubAuth.clearStateCookie());
      if (!pending) {
        return reply.redirect('/?login_error=invalid_state');
      }
      if (request.query.error || !request.query.code) {
        return reply.redirect('/?login_error=access_denied');
      }
      try {
        const identity = await provider.exchangeCode(request.query.code, webRedirectUri);
        const user = users.upsertFromFeishu(identity);
        hubAuth.setSessionCookies(reply, hubAuth.sessions.createSession(user.openId, 'web'));
        return reply.redirect(pending.returnTo);
      } catch (error) {
        const failure = failureStatus(error);
        request.log.warn({ code: failure.code, reason: error instanceof Error ? error.message : undefined }, 'feishu web login failed');
        return reply.redirect(`/?login_error=${failure.code}`);
      }
    });

    app.post<{ Body: { code?: string; redirectUri?: string; codeVerifier?: string; client?: string; deviceId?: string } }>(
      '/api/v1/auth/feishu/exchange',
      { preHandler: limited },
      async (request, reply) => {
        const body = request.body ?? {};
        const client = body.client as SessionClient | undefined;
        if (typeof body.code !== 'string' || !body.code || (client !== 'installer' && client !== 'cli')) {
          return reply.code(400).send({ error: 'invalid_request' });
        }
        if (!isLoopbackRedirect(body.redirectUri)) {
          return reply.code(400).send({ error: 'invalid_redirect_uri' });
        }
        if (typeof body.codeVerifier !== 'string' || !verifierPattern.test(body.codeVerifier)) {
          return reply.code(400).send({ error: 'invalid_code_verifier' });
        }
        if (body.deviceId !== undefined && (typeof body.deviceId !== 'string' || !idPattern.test(body.deviceId))) {
          return reply.code(400).send({ error: 'invalid_request' });
        }
        try {
          const identity = await provider.exchangeCode(body.code, body.redirectUri, { codeVerifier: body.codeVerifier });
          const user = users.upsertFromFeishu(identity);
          const issued = hubAuth.sessions.createSession(user.openId, client, body.deviceId);
          if (body.deviceId) {
            deps.events?.bindDevice(user.openId, body.deviceId);
          }
          return { user: publicUser(user), ...issued };
        } catch (error) {
          const failure = failureStatus(error);
          request.log.warn({ code: failure.code, reason: error instanceof Error ? error.message : undefined }, 'feishu code exchange failed');
          return reply.code(failure.status).send({ error: failure.code });
        }
      }
    );

    app.get('/api/v1/auth/me', async (request, reply) => {
      const session = hubAuth.resolveWithRefresh(request, reply);
      if (!session) {
        return reply.code(401).send({ authenticated: false });
      }
      return { authenticated: true, user: publicUser(session.user) };
    });

    app.post<{ Body: { refreshToken?: string } | undefined }>('/api/v1/auth/refresh', async (request, reply) => {
      if (!sameOrigin(request)) {
        return reply.code(403).send({ error: 'cross_origin_rejected' });
      }
      const fromBody = typeof request.body?.refreshToken === 'string' ? request.body.refreshToken : undefined;
      const refreshToken = fromBody ?? parseCookies(request.headers.cookie)[refreshCookie];
      const issued = refreshToken ? hubAuth.sessions.refresh(refreshToken) : undefined;
      if (!issued) {
        return reply.code(401).send({ error: 'invalid_refresh_token' });
      }
      const session = hubAuth.sessions.verifyAccessToken(issued.accessToken);
      if (fromBody) {
        return { user: session ? publicUser(session.user) : undefined, ...issued };
      }
      hubAuth.setSessionCookies(reply, issued);
      return { user: session ? publicUser(session.user) : undefined, accessExpiresAt: issued.accessExpiresAt };
    });

    app.post<{ Body: { refreshToken?: string } | undefined }>('/api/v1/auth/logout', async (request, reply) => {
      if (!sameOrigin(request)) {
        return reply.code(403).send({ error: 'cross_origin_rejected' });
      }
      const refreshToken = (typeof request.body?.refreshToken === 'string' ? request.body.refreshToken : undefined) ?? parseCookies(request.headers.cookie)[refreshCookie];
      const session = hubAuth.resolve(request);
      if (session) {
        hubAuth.sessions.revoke(session.sessionId);
      }
      if (refreshToken) {
        hubAuth.sessions.revokeByRefreshToken(refreshToken);
      }
      hubAuth.clearSessionCookies(reply);
      return { authenticated: false };
    });
  };
}
