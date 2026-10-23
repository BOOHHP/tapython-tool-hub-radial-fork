import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { SqliteDatabase } from '../database/sqlite.js';
import type { UserRecord, UserRepository } from './userRepository.js';

export type SessionClient = 'web' | 'installer' | 'cli';

export interface SessionServiceOptions {
  secret: string;
  now?: () => Date;
  accessTtlMs?: number;
  refreshTtlMs?: number;
}

export interface IssuedSession {
  sessionId: string;
  accessToken: string;
  accessExpiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
}

export interface AuthenticatedSession {
  user: UserRecord;
  sessionId: string;
  client: SessionClient;
  deviceId?: string;
}

const tokenVersion = 'v1';

export class SessionService {
  private readonly signingKey: Buffer;
  private readonly now: () => Date;
  private readonly accessTtlMs: number;
  private readonly refreshTtlMs: number;

  constructor(private readonly db: SqliteDatabase, private readonly users: UserRepository, options: SessionServiceOptions) {
    // A derived key keeps these tokens unusable as admin cookies even if both share AUTH_SESSION_SECRET.
    this.signingKey = createHmac('sha256', options.secret).update('tapython-hub/user-access/v1').digest();
    this.now = options.now ?? (() => new Date());
    this.accessTtlMs = options.accessTtlMs ?? 15 * 60_000;
    this.refreshTtlMs = options.refreshTtlMs ?? 30 * 24 * 3600_000;
  }

  createSession(openId: string, client: SessionClient, deviceId?: string): IssuedSession {
    const user = this.users.get(openId);
    if (!user || user.status !== 'active') {
      throw new Error(`User ${openId} cannot start a session`);
    }
    const sessionId = randomUUID();
    const refreshToken = randomBytes(32).toString('base64url');
    const created = this.now();
    this.db
      .prepare('INSERT INTO sessions (id, open_id, refresh_hash, client, device_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(sessionId, openId, hashToken(refreshToken), client, deviceId ?? null, created.toISOString(), new Date(created.getTime() + this.refreshTtlMs).toISOString());
    return this.issue(sessionId, openId, refreshToken, new Date(created.getTime() + this.refreshTtlMs));
  }

  verifyAccessToken(token: string): AuthenticatedSession | undefined {
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== tokenVersion) {
      return undefined;
    }
    const expected = createHmac('sha256', this.signingKey).update(`${parts[0]}.${parts[1]}`).digest();
    const actual = Buffer.from(parts[2], 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      return undefined;
    }

    let payload: { sub?: string; sid?: string; exp?: number };
    try {
      payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    } catch {
      return undefined;
    }
    if (!payload.sub || !payload.sid || typeof payload.exp !== 'number' || payload.exp <= this.now().getTime()) {
      return undefined;
    }

    const session = this.db.prepare('SELECT * FROM sessions WHERE id = ? AND open_id = ? AND revoked_at IS NULL').get(payload.sid, payload.sub);
    const user = this.users.get(payload.sub);
    if (!session || !user || user.status !== 'active') {
      return undefined;
    }
    return {
      user,
      sessionId: String(session.id),
      client: session.client as SessionClient,
      deviceId: session.device_id === null ? undefined : String(session.device_id)
    };
  }

  refresh(refreshToken: string): IssuedSession | undefined {
    const session = this.db.prepare('SELECT * FROM sessions WHERE refresh_hash = ? AND revoked_at IS NULL').get(hashToken(refreshToken));
    if (!session || new Date(String(session.expires_at)).getTime() <= this.now().getTime()) {
      return undefined;
    }
    const user = this.users.get(String(session.open_id));
    if (!user || user.status !== 'active') {
      return undefined;
    }

    const rotated = randomBytes(32).toString('base64url');
    const expiresAt = new Date(this.now().getTime() + this.refreshTtlMs);
    this.db.prepare('UPDATE sessions SET refresh_hash = ?, expires_at = ? WHERE id = ?').run(hashToken(rotated), expiresAt.toISOString(), session.id);
    return this.issue(String(session.id), user.openId, rotated, expiresAt);
  }

  revoke(sessionId: string): boolean {
    const result = this.db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(this.now().toISOString(), sessionId);
    return Number(result.changes) > 0;
  }

  revokeByRefreshToken(refreshToken: string): boolean {
    const result = this.db
      .prepare('UPDATE sessions SET revoked_at = ? WHERE refresh_hash = ? AND revoked_at IS NULL')
      .run(this.now().toISOString(), hashToken(refreshToken));
    return Number(result.changes) > 0;
  }

  private issue(sessionId: string, openId: string, refreshToken: string, refreshExpiresAt: Date): IssuedSession {
    const accessExpires = new Date(this.now().getTime() + this.accessTtlMs);
    const payload = Buffer.from(JSON.stringify({ sub: openId, sid: sessionId, exp: accessExpires.getTime() })).toString('base64url');
    const signature = createHmac('sha256', this.signingKey).update(`${tokenVersion}.${payload}`).digest('base64url');
    return {
      sessionId,
      accessToken: `${tokenVersion}.${payload}.${signature}`,
      accessExpiresAt: accessExpires.toISOString(),
      refreshToken,
      refreshExpiresAt: refreshExpiresAt.toISOString()
    };
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
