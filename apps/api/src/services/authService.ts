import crypto from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ApiConfig } from '../config/env.js';

export interface AdminSession {
  username: string;
  expiresAt: number;
}

export interface AdminUser {
  username: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    adminUser?: AdminUser;
  }
}

const cookieName = 'tapython_admin_session';
const hashParts = 4;

export class AuthService {
  constructor(private readonly config: ApiConfig) {}

  isConfigured(): boolean {
    return Boolean(this.config.adminUsername && this.config.adminPasswordHash && this.config.authSessionSecret);
  }

  async verifyCredentials(username: string, password: string): Promise<boolean> {
    if (!this.isConfigured() || username !== this.config.adminUsername) {
      return false;
    }
    return verifyPassword(password, this.config.adminPasswordHash!);
  }

  createSession(username: string): string {
    const ttlMs = this.sessionTtlHours() * 60 * 60 * 1000;
    const payload: AdminSession = {
      username,
      expiresAt: Date.now() + ttlMs
    };
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signature = sign(encodedPayload, this.config.authSessionSecret!);
    return `${encodedPayload}.${signature}`;
  }

  readSession(request: FastifyRequest): AdminSession | undefined {
    if (!this.isConfigured()) {
      return undefined;
    }
    const token = parseCookies(request.headers.cookie)[cookieName];
    if (!token) {
      return undefined;
    }
    const [encodedPayload, signature] = token.split('.');
    if (!encodedPayload || !signature) {
      return undefined;
    }
    const expectedSignature = sign(encodedPayload, this.config.authSessionSecret!);
    if (!timingSafeEqual(signature, expectedSignature)) {
      return undefined;
    }
    try {
      const session = JSON.parse(base64UrlDecode(encodedPayload)) as AdminSession;
      if (session.username !== this.config.adminUsername || session.expiresAt < Date.now()) {
        return undefined;
      }
      return session;
    } catch {
      return undefined;
    }
  }

  setSessionCookie(reply: FastifyReply, token: string): void {
    const maxAge = this.sessionTtlHours() * 60 * 60;
    reply.header('Set-Cookie', `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`);
  }

  clearSessionCookie(reply: FastifyReply): void {
    reply.header('Set-Cookie', `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  }

  requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!this.isConfigured()) {
      return reply.code(503).send({ error: 'admin_auth_not_configured' });
    }
    const session = this.readSession(request);
    if (!session) {
      return reply.code(401).send({ error: 'admin_auth_required' });
    }
    request.adminUser = { username: session.username };
  };

  private sessionTtlHours(): number {
    return Math.max(1, this.config.adminSessionTtlHours ?? 12);
  }
}

export function createPasswordHash(password: string, salt = crypto.randomBytes(16).toString('base64url'), iterations = 210000): string {
  const digest = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('base64url');
  return `pbkdf2-sha256$${iterations}$${salt}$${digest}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== hashParts || parts[0] !== 'pbkdf2-sha256') {
    return false;
  }
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 100000) {
    return false;
  }
  const expected = parts[3];
  const actual = crypto.pbkdf2Sync(password, parts[2], iterations, 32, 'sha256').toString('base64url');
  return timingSafeEqual(actual, expected);
}

function sign(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function timingSafeEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) {
    return {};
  }
  return Object.fromEntries(header.split(';').map((part) => {
    const [key, ...value] = part.trim().split('=');
    return [key, value.join('=')];
  }).filter(([key]) => key));
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}