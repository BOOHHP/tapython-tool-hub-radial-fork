import type { FeishuIdentity } from '../auth/feishuProvider.js';
import type { SqliteDatabase } from '../database/sqlite.js';
import { AuditLog } from './auditLog.js';

export type Role = 'reviewer' | 'admin';

export interface UserRecord {
  openId: string;
  unionId?: string;
  name: string;
  email?: string;
  department?: string;
  // Admin override; effective team is team ?? department.
  team?: string;
  status: 'active' | 'left';
  roles: Role[];
  createdAt: string;
  lastLoginAt?: string;
}

export class EmailConflictError extends Error {
  constructor(email: string) {
    super(`Another account already uses ${email}`);
    this.name = 'EmailConflictError';
  }
}

export class UserDisabledError extends Error {
  constructor(openId: string) {
    super(`User ${openId} has left and cannot sign in`);
    this.name = 'UserDisabledError';
  }
}

export class LastAdminError extends Error {
  constructor() {
    super('The last active admin cannot be removed');
    this.name = 'LastAdminError';
  }
}

export interface UserRepositoryOptions {
  bootstrapAdminEmails?: string[];
  now?: () => Date;
}

const roleOrder: Role[] = ['reviewer', 'admin'];

export class UserRepository {
  private readonly bootstrapEmails: Set<string>;
  private readonly now: () => Date;
  private readonly audit: AuditLog;

  constructor(private readonly db: SqliteDatabase, options: UserRepositoryOptions = {}) {
    this.bootstrapEmails = new Set((options.bootstrapAdminEmails ?? []).map((email) => email.trim().toLowerCase()).filter(Boolean));
    this.now = options.now ?? (() => new Date());
    this.audit = new AuditLog(db, this.now);
  }

  upsertFromFeishu(identity: FeishuIdentity): UserRecord {
    const timestamp = this.now().toISOString();
    const existing = this.get(identity.openId);
    if (existing?.status === 'left') {
      throw new UserDisabledError(identity.openId);
    }
    if (identity.email) {
      const owner = this.db
        .prepare('SELECT open_id FROM users WHERE lower(email) = lower(?) AND open_id <> ?')
        .get(identity.email, identity.openId);
      if (owner) {
        throw new EmailConflictError(identity.email);
      }
    }

    if (existing) {
      this.db
        .prepare('UPDATE users SET union_id = ?, name = ?, email = ?, department = ?, last_login_at = ? WHERE open_id = ?')
        .run(identity.unionId ?? existing.unionId ?? null, identity.name, identity.email ?? existing.email ?? null, identity.department ?? existing.department ?? null, timestamp, identity.openId);
    } else {
      this.db
        .prepare('INSERT INTO users (open_id, union_id, name, email, department, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(identity.openId, identity.unionId ?? null, identity.name, identity.email ?? null, identity.department ?? null, timestamp, timestamp);
    }

    if (identity.email && this.bootstrapEmails.has(identity.email.trim().toLowerCase()) && !this.rolesOf(identity.openId).includes('admin')) {
      const before = this.rolesOf(identity.openId);
      this.writeRoles(identity.openId, [...before, 'admin'], 'bootstrap');
      this.audit.record({ actor: 'bootstrap', action: 'role.grant', entityType: 'user', entityId: identity.openId, before, after: [...before, 'admin'] });
    }
    return this.get(identity.openId)!;
  }

  get(openId: string): UserRecord | undefined {
    const row = this.db.prepare('SELECT * FROM users WHERE open_id = ?').get(openId);
    return row ? this.toRecord(row) : undefined;
  }

  list(): UserRecord[] {
    return this.db.prepare('SELECT * FROM users ORDER BY created_at, open_id').all().map((row) => this.toRecord(row));
  }

  setRoles(actor: string, openId: string, roles: Role[]): UserRecord {
    const user = this.get(openId);
    if (!user) {
      throw new Error(`User ${openId} not found`);
    }
    const next = normalizeRoles(roles);
    if (user.roles.includes('admin') && !next.includes('admin') && user.status === 'active' && this.activeAdminCount() <= 1) {
      throw new LastAdminError();
    }
    this.writeRoles(openId, next, actor);
    this.audit.record({ actor, action: 'role.set', entityType: 'user', entityId: openId, before: user.roles, after: next });
    return this.get(openId)!;
  }

  setTeam(actor: string, openId: string, team: string | null): UserRecord {
    const user = this.get(openId);
    if (!user) {
      throw new Error(`User ${openId} not found`);
    }
    const next = team?.trim() || null;
    this.db.prepare('UPDATE users SET team = ? WHERE open_id = ?').run(next, openId);
    this.audit.record({ actor, action: 'user.team', entityType: 'user', entityId: openId, before: user.team ?? null, after: next });
    return this.get(openId)!;
  }

  markLeft(actor: string, openId: string): UserRecord {
    const user = this.get(openId);
    if (!user) {
      throw new Error(`User ${openId} not found`);
    }
    if (user.roles.includes('admin') && user.status === 'active' && this.activeAdminCount() <= 1) {
      throw new LastAdminError();
    }
    this.db.prepare("UPDATE users SET status = 'left' WHERE open_id = ?").run(openId);
    this.audit.record({ actor, action: 'user.left', entityType: 'user', entityId: openId, before: { status: user.status }, after: { status: 'left' } });
    return this.get(openId)!;
  }

  private rolesOf(openId: string): Role[] {
    const rows = this.db.prepare('SELECT role FROM user_roles WHERE open_id = ?').all(openId);
    return normalizeRoles(rows.map((row) => String(row.role) as Role));
  }

  private writeRoles(openId: string, roles: Role[], grantedBy: string): void {
    const timestamp = this.now().toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('DELETE FROM user_roles WHERE open_id = ?').run(openId);
      const insert = this.db.prepare('INSERT INTO user_roles (open_id, role, granted_by, granted_at) VALUES (?, ?, ?, ?)');
      for (const role of normalizeRoles(roles)) {
        insert.run(openId, role, grantedBy, timestamp);
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private activeAdminCount(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM user_roles r JOIN users u ON u.open_id = r.open_id WHERE r.role = 'admin' AND u.status = 'active'")
      .get();
    return Number(row?.n ?? 0);
  }

  private toRecord(row: Record<string, unknown>): UserRecord {
    const openId = String(row.open_id);
    return {
      openId,
      unionId: row.union_id === null ? undefined : String(row.union_id),
      name: String(row.name),
      email: row.email === null ? undefined : String(row.email),
      department: row.department === null ? undefined : String(row.department),
      team: row.team === null || row.team === undefined ? undefined : String(row.team),
      status: row.status === 'left' ? 'left' : 'active',
      roles: this.rolesOf(openId),
      createdAt: String(row.created_at),
      lastLoginAt: row.last_login_at === null ? undefined : String(row.last_login_at)
    };
  }
}

function normalizeRoles(roles: Role[]): Role[] {
  return roleOrder.filter((role) => roles.includes(role));
}
