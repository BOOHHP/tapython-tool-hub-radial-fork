import crypto from 'node:crypto';
import type { SqliteDatabase } from '../database/sqlite.js';

export const feedbackKinds = ['bug', 'suggestion'] as const;
export const feedbackStatuses = ['open', 'in_progress', 'resolved', 'wontfix'] as const;
export const feedbackClients = ['web', 'installer', 'cli'] as const;
export type FeedbackKind = (typeof feedbackKinds)[number];
export type FeedbackStatus = (typeof feedbackStatuses)[number];

export interface FeedbackInput {
  kind: FeedbackKind;
  title: string;
  body: string;
  slug?: string;
  client?: string;
  clientVersion?: string;
  ueVersion?: string;
}

export interface FeedbackPerson {
  openId: string;
  name: string;
  department?: string;
}

export interface FeedbackRecord {
  id: string;
  kind: FeedbackKind;
  title: string;
  body: string;
  status: FeedbackStatus;
  slug?: string;
  client?: string;
  clientVersion?: string;
  ueVersion?: string;
  author: FeedbackPerson;
  assignee?: FeedbackPerson;
  replyCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackReply {
  id: string;
  body: string;
  author: FeedbackPerson;
  staff: boolean;
  createdAt: string;
}

export interface FeedbackDetail extends FeedbackRecord {
  replies: FeedbackReply[];
}

export class FeedbackLimitError extends Error {
  constructor() {
    super('Too many feedback items submitted recently');
    this.name = 'FeedbackLimitError';
  }
}

export class FeedbackValidationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'FeedbackValidationError';
  }
}

const hourlyLimit = 10;
const maxListed = 300;

const selectFeedback = `
  SELECT f.*, a.name AS author_name, a.department AS author_department, s.name AS assignee_name, s.department AS assignee_department,
         (SELECT COUNT(*) FROM feedback_replies r WHERE r.feedback_id = f.id) AS reply_count
  FROM feedback f
  JOIN users a ON a.open_id = f.author_open_id
  LEFT JOIN users s ON s.open_id = f.assignee_open_id`;

export class FeedbackStore {
  constructor(private readonly db: SqliteDatabase, private readonly now: () => Date = () => new Date()) {}

  create(authorOpenId: string, input: FeedbackInput): FeedbackRecord {
    const since = new Date(this.now().getTime() - 3_600_000).toISOString();
    const recent = this.db.prepare('SELECT COUNT(*) AS n FROM feedback WHERE author_open_id = ? AND created_at >= ?').get(authorOpenId, since);
    if (Number(recent?.n ?? 0) >= hourlyLimit) {
      throw new FeedbackLimitError();
    }
    const id = crypto.randomUUID();
    const timestamp = this.now().toISOString();
    this.db
      .prepare('INSERT INTO feedback (id, author_open_id, kind, title, body, slug, client, client_version, ue_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, authorOpenId, input.kind, input.title, input.body, input.slug ?? null, input.client ?? null, input.clientVersion ?? null, input.ueVersion ?? null, timestamp, timestamp);
    return this.getRecord(id)!;
  }

  listForUser(openId: string): FeedbackRecord[] {
    return this.db.prepare(`${selectFeedback} WHERE f.author_open_id = ? ORDER BY f.created_at DESC LIMIT ?`).all(openId, maxListed).map(toRecord);
  }

  list(filter: { status?: FeedbackStatus; kind?: FeedbackKind } = {}): FeedbackRecord[] {
    const where: string[] = [];
    const params: string[] = [];
    if (filter.status) {
      where.push('f.status = ?');
      params.push(filter.status);
    }
    if (filter.kind) {
      where.push('f.kind = ?');
      params.push(filter.kind);
    }
    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    return this.db.prepare(`${selectFeedback}${clause} ORDER BY f.created_at DESC LIMIT ?`).all(...params, maxListed).map(toRecord);
  }

  get(id: string): FeedbackDetail | undefined {
    const record = this.getRecord(id);
    if (!record) {
      return undefined;
    }
    const replies = this.db
      .prepare(
        `SELECT r.*, u.name AS author_name, u.department AS author_department,
                EXISTS (SELECT 1 FROM user_roles ur WHERE ur.open_id = r.author_open_id) AS is_staff
         FROM feedback_replies r JOIN users u ON u.open_id = r.author_open_id
         WHERE r.feedback_id = ? ORDER BY r.created_at, r.id`
      )
      .all(id)
      .map((row) => ({
        id: String(row.id),
        body: String(row.body),
        author: person(row.author_open_id, row.author_name, row.author_department)!,
        staff: Number(row.is_staff) === 1,
        createdAt: String(row.created_at)
      }));
    return { ...record, replies };
  }

  addReply(id: string, authorOpenId: string, body: string): FeedbackReply {
    const replyId = crypto.randomUUID();
    const timestamp = this.now().toISOString();
    this.db.prepare('INSERT INTO feedback_replies (id, feedback_id, author_open_id, body, created_at) VALUES (?, ?, ?, ?, ?)').run(replyId, id, authorOpenId, body, timestamp);
    this.db.prepare('UPDATE feedback SET updated_at = ? WHERE id = ?').run(timestamp, id);
    return this.get(id)!.replies.find((reply) => reply.id === replyId)!;
  }

  // assigneeOpenId: undefined keeps the current value, null clears it.
  update(id: string, changes: { status?: FeedbackStatus; assigneeOpenId?: string | null }): { before: FeedbackRecord; after: FeedbackRecord } | undefined {
    const before = this.getRecord(id);
    if (!before) {
      return undefined;
    }
    if (changes.assigneeOpenId) {
      const assignee = this.db
        .prepare("SELECT 1 AS ok FROM users u JOIN user_roles r ON r.open_id = u.open_id WHERE u.open_id = ? AND u.status = 'active'")
        .get(changes.assigneeOpenId);
      if (!assignee) {
        throw new FeedbackValidationError('invalid_assignee', 'The assignee must be an active reviewer or admin');
      }
    }
    const status = changes.status ?? before.status;
    const assignee = changes.assigneeOpenId === undefined ? before.assignee?.openId ?? null : changes.assigneeOpenId;
    this.db.prepare('UPDATE feedback SET status = ?, assignee_open_id = ?, updated_at = ? WHERE id = ?').run(status, assignee, this.now().toISOString(), id);
    return { before, after: this.getRecord(id)! };
  }

  private getRecord(id: string): FeedbackRecord | undefined {
    const row = this.db.prepare(`${selectFeedback} WHERE f.id = ?`).get(id);
    return row ? toRecord(row) : undefined;
  }
}

function toRecord(row: Record<string, unknown>): FeedbackRecord {
  return {
    id: String(row.id),
    kind: row.kind as FeedbackKind,
    title: String(row.title),
    body: String(row.body),
    status: row.status as FeedbackStatus,
    slug: optional(row.slug),
    client: optional(row.client),
    clientVersion: optional(row.client_version),
    ueVersion: optional(row.ue_version),
    author: person(row.author_open_id, row.author_name, row.author_department)!,
    assignee: person(row.assignee_open_id, row.assignee_name, row.assignee_department),
    replyCount: Number(row.reply_count ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function person(openId: unknown, name: unknown, department: unknown): FeedbackPerson | undefined {
  return openId === null || openId === undefined ? undefined : { openId: String(openId), name: String(name), department: optional(department) };
}

function optional(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : String(value);
}
