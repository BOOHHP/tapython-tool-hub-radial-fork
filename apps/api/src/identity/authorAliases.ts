import type { SqliteDatabase } from '../database/sqlite.js';
import { AuditLog } from './auditLog.js';

export type AliasKind = 'person' | 'team';

export interface AliasRecord {
  alias: string;
  kind: AliasKind;
  openId?: string;
  userName?: string;
  createdBy: string;
  createdAt: string;
}

export interface AliasCandidate {
  name: string;
  submissions: number;
  tools: number;
  kind?: AliasKind;
  openId?: string;
}

export class AliasError extends Error {}

export class AuthorAliases {
  private readonly audit: AuditLog;

  constructor(private readonly db: SqliteDatabase, private readonly now: () => Date = () => new Date()) {
    this.audit = new AuditLog(db, now);
  }

  list(): AliasRecord[] {
    return this.db
      .prepare('SELECT a.alias, a.kind, a.open_id, a.created_by, a.created_at, u.name AS user_name FROM author_aliases a LEFT JOIN users u ON u.open_id = a.open_id ORDER BY a.alias')
      .all()
      .map((row) => ({
        alias: String(row.alias),
        kind: row.kind as AliasKind,
        openId: row.open_id === null ? undefined : String(row.open_id),
        userName: row.user_name === null ? undefined : String(row.user_name),
        createdBy: String(row.created_by),
        createdAt: String(row.created_at)
      }));
  }

  // Every free-text name seen as a submitter or tool author, with how it is currently bound.
  candidates(): AliasCandidate[] {
    return this.db
      .prepare(
        `WITH names AS (
           SELECT submitter AS name FROM submissions
           UNION SELECT author FROM tools WHERE author IS NOT NULL
           UNION SELECT author FROM tool_versions WHERE author IS NOT NULL
         )
         SELECT n.name,
           (SELECT COUNT(*) FROM submissions s WHERE s.submitter = n.name) AS submissions,
           (SELECT COUNT(*) FROM tools t WHERE t.author = n.name) AS tools,
           a.kind, a.open_id
         FROM names n LEFT JOIN author_aliases a ON a.alias = n.name
         WHERE trim(n.name) <> ''
         ORDER BY (submissions + tools) DESC, n.name`
      )
      .all()
      .map((row) => ({
        name: String(row.name),
        submissions: Number(row.submissions),
        tools: Number(row.tools),
        kind: row.kind === null ? undefined : (row.kind as AliasKind),
        openId: row.open_id === null ? undefined : String(row.open_id)
      }));
  }

  bind(actor: string, aliasInput: string, kind: AliasKind, openId?: string): AliasRecord {
    const alias = aliasInput.trim();
    if (!alias || alias.length > 100) {
      throw new AliasError('alias must be 1-100 characters');
    }
    if (kind === 'person') {
      if (!openId || !this.db.prepare('SELECT 1 FROM users WHERE open_id = ?').get(openId)) {
        throw new AliasError('a person alias needs an existing user');
      }
    }
    const before = this.db.prepare('SELECT kind, open_id FROM author_aliases WHERE alias = ?').get(alias);
    this.db
      .prepare(
        `INSERT INTO author_aliases (alias, kind, open_id, created_by, created_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(alias) DO UPDATE SET kind = excluded.kind, open_id = excluded.open_id, created_by = excluded.created_by, created_at = excluded.created_at`
      )
      .run(alias, kind, kind === 'person' ? openId! : null, actor, this.now().toISOString());
    this.audit.record({ actor, action: 'alias.bind', entityType: 'alias', entityId: alias, before: before ? { ...before } : null, after: { kind, openId: openId ?? null } });
    return this.list().find((record) => record.alias.toLowerCase() === alias.toLowerCase())!;
  }

  unbind(actor: string, alias: string): boolean {
    const before = this.db.prepare('SELECT kind, open_id FROM author_aliases WHERE alias = ?').get(alias);
    const removed = Number(this.db.prepare('DELETE FROM author_aliases WHERE alias = ?').run(alias).changes) > 0;
    if (removed) {
      this.audit.record({ actor, action: 'alias.unbind', entityType: 'alias', entityId: alias, before: before ? { ...before } : null });
    }
    return removed;
  }
}
