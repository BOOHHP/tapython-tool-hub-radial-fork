import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthService } from '../services/authService.js';
import type { IssuedSession, AuthenticatedSession, SessionService } from './sessionService.js';
import type { Role } from './userRepository.js';

export const accessCookie = 'tapython_hub_access';
export const refreshCookie = 'tapython_hub_refresh';
export const stateCookie = 'tapython_hub_oauth_state';
const refreshCookiePath = '/api/v1/auth';
const stateTtlMs = 10 * 60_000;

declare module 'fastify' {
  interface FastifyRequest {
    hubSession?: AuthenticatedSession;
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0) {
      cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim();
    }
  }
  return cookies;
}

export function hasRole(roles: Role[], required: Role): boolean {
  return required === 'reviewer' ? roles.includes('reviewer') || roles.includes('admin') : roles.includes('admin');
}

// Only same-site relative paths may be used as a post-login destination.
export function safeReturnTo(value: unknown): string {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) && !/[\r\n]/.test(value) ? value : '/';
}

export class HubAuth {
  private readonly stateKey: Buffer;
  private readonly secureCookies: boolean;

  constructor(readonly sessions: SessionService, secret: string, publicBaseUrl: string) {
    this.stateKey = createHmac('sha256', secret).update('tapython-hub/oauth-state/v1').digest();
    this.secureCookies = publicBaseUrl.startsWith('https://');
  }

  resolve(request: FastifyRequest): AuthenticatedSession | undefined {
    if (request.hubSession) {
      return request.hubSession;
    }
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length).trim()
      : parseCookies(request.headers.cookie)[accessCookie];
    const session = token ? this.sessions.verifyAccessToken(token) : undefined;
    if (session) {
      request.hubSession = session;
    }
    return session;
  }

  // Web only: when the short-lived access cookie has lapsed, the refresh cookie transparently renews it.
  resolveWithRefresh(request: FastifyRequest, reply: FastifyReply): AuthenticatedSession | undefined {
    const direct = this.resolve(request);
    if (direct) {
      return direct;
    }
    const refreshToken = parseCookies(request.headers.cookie)[refreshCookie];
    const issued = refreshToken ? this.sessions.refresh(refreshToken) : undefined;
    if (!issued) {
      return undefined;
    }
    this.setSessionCookies(reply, issued);
    const session = this.sessions.verifyAccessToken(issued.accessToken);
    if (session) {
      request.hubSession = session;
    }
    return session;
  }

  setSessionCookies(reply: FastifyReply, issued: IssuedSession): void {
    reply.header('Set-Cookie', [
      this.cookie(accessCookie, issued.accessToken, '/', issued.accessExpiresAt),
      this.cookie(refreshCookie, issued.refreshToken, refreshCookiePath, issued.refreshExpiresAt)
    ]);
  }

  clearSessionCookies(reply: FastifyReply): void {
    reply.header('Set-Cookie', [this.clearCookie(accessCookie, '/'), this.clearCookie(refreshCookie, refreshCookiePath)]);
  }

  createState(returnTo: string): { state: string; cookie: string } {
    const nonce = randomBytes(18).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ n: nonce, r: returnTo, exp: Date.now() + stateTtlMs })).toString('base64url');
    const value = `${payload}.${createHmac('sha256', this.stateKey).update(payload).digest('base64url')}`;
    return { state: nonce, cookie: this.cookie(stateCookie, value, '/api/v1/auth', new Date(Date.now() + stateTtlMs).toISOString()) };
  }

  consumeState(request: FastifyRequest, state: string | undefined): { returnTo: string } | undefined {
    const value = parseCookies(request.headers.cookie)[stateCookie];
    const [payload, signature] = (value ?? '').split('.');
    if (!state || !payload || !signature) {
      return undefined;
    }
    const expected = createHmac('sha256', this.stateKey).update(payload).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { n?: string; r?: string; exp?: number };
      if (parsed.n !== state || typeof parsed.exp !== 'number' || parsed.exp < Date.now()) {
        return undefined;
      }
      return { returnTo: safeReturnTo(parsed.r) };
    } catch {
      return undefined;
    }
  }

  clearStateCookie(): string {
    return this.clearCookie(stateCookie, '/api/v1/auth');
  }

  private cookie(name: string, value: string, path: string, expiresAt: string): string {
    const maxAge = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
    return `${name}=${value}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${this.secureCookies ? '; Secure' : ''}`;
  }

  private clearCookie(name: string, path: string): string {
    return `${name}=; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=0${this.secureCookies ? '; Secure' : ''}`;
  }
}

export interface Actor {
  id: string;
  name: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    actor?: Actor;
  }
}

// Admin APIs accept the emergency local admin (legacy cookie) or a Feishu user holding the needed role.
export function createAdminGuard(authService: AuthService, hubAuth?: HubAuth) {
  return (required: Role) => async (request: FastifyRequest, reply: FastifyReply) => {
    if (authService.isConfigured()) {
      const legacy = authService.readSession(request);
      if (legacy) {
        request.adminUser = { username: legacy.username };
        request.actor = { id: `emergency:${legacy.username}`, name: legacy.username };
        return;
      }
    }
    const session = hubAuth?.resolveWithRefresh(request, reply);
    if (session) {
      if (!hasRole(session.user.roles, required)) {
        return reply.code(403).send({ error: 'forbidden', required });
      }
      request.adminUser = { username: session.user.name };
      request.actor = { id: session.user.openId, name: session.user.name };
      return;
    }
    if (!hubAuth && !authService.isConfigured()) {
      return reply.code(503).send({ error: 'admin_auth_not_configured' });
    }
    return reply.code(401).send({ error: 'admin_auth_required' });
  };
}
