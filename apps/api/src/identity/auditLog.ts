import type { SqliteDatabase } from '../database/sqlite.js';

export interface AuditEntry {
  actor: string;
  action: string;
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
}

export class AuditLog {
  constructor(private readonly db: SqliteDatabase, private readonly now: () => Date = () => new Date()) {}

  record(entry: AuditEntry): void {
    this.db
      .prepare('INSERT INTO audit_log (at, actor, action, entity_type, entity_id, before, after) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(
        this.now().toISOString(),
        entry.actor,
        entry.action,
        entry.entityType ?? null,
        entry.entityId ?? null,
        entry.before === undefined ? null : JSON.stringify(entry.before),
        entry.after === undefined ? null : JSON.stringify(entry.after)
      );
  }
}
