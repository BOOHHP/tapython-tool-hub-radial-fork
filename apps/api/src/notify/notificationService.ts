import crypto from 'node:crypto';
import type { SqliteDatabase } from '../database/sqlite.js';
import { BotSendError, type FeishuBot, type NotificationMessage } from './feishuBot.js';

export interface NotificationServiceOptions {
  publicBaseUrl?: string;
  now?: () => Date;
  log?: (message: string, detail: Record<string, unknown>) => void;
  // Delay before attempt N+1; the number of entries is the retry budget.
  retryDelaysMs?: number[];
}

interface SubmissionRef {
  id: string;
  slug: string;
  submitter: string;
}

export interface FeedbackRef {
  id: string;
  kind: string;
  title: string;
  body: string;
  authorOpenId: string;
  authorName: string;
  assigneeOpenId?: string;
  updatedAt: string;
}

const defaultRetryDelaysMs = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];
const batchSize = 20;
const maxText = 200;

export class NotificationService {
  private readonly now: () => Date;
  private readonly retryDelaysMs: number[];
  private readonly baseUrl: string;
  private timer?: NodeJS.Timeout;
  private flushing?: Promise<unknown>;

  constructor(private readonly db: SqliteDatabase, private readonly bot: FeishuBot, private readonly options: NotificationServiceOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.retryDelaysMs = options.retryDelaysMs ?? defaultRetryDelaysMs;
    this.baseUrl = (options.publicBaseUrl ?? '').replace(/\/+$/, '');
  }

  start(intervalMs = 15_000): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => void this.flush(), intervalMs);
    this.timer.unref();
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    await this.flushing;
  }

  // Idempotent: the same dedupeKey is queued once, whatever the number of callers or retries.
  enqueue(kind: string, openId: string, dedupeKey: string, message: NotificationMessage): boolean {
    const recipient = this.db.prepare("SELECT 1 AS ok FROM users WHERE open_id = ? AND status = 'active'").get(openId);
    if (!recipient) {
      return false;
    }
    const timestamp = this.now().toISOString();
    const result = this.db
      .prepare('INSERT OR IGNORE INTO notifications (id, kind, recipient_open_id, dedupe_key, payload, next_attempt_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), kind, openId, dedupeKey, JSON.stringify(message), timestamp, timestamp);
    return Number(result.changes) > 0;
  }

  flush(): Promise<{ sent: number; retrying: number; failed: number }> {
    // One delivery loop at a time keeps attempt counters and Feishu rate use predictable.
    const run = (this.flushing ?? Promise.resolve()).then(() => this.deliverDue());
    this.flushing = run.catch(() => undefined);
    return run;
  }

  private async deliverDue() {
    const totals = { sent: 0, retrying: 0, failed: 0 };
    const due = this.db
      .prepare("SELECT id, recipient_open_id, payload, attempts FROM notifications WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY created_at LIMIT ?")
      .all(this.now().toISOString(), batchSize);
    for (const row of due) {
      const id = String(row.id);
      const attempts = Number(row.attempts) + 1;
      try {
        await this.bot.send(String(row.recipient_open_id), JSON.parse(String(row.payload)) as NotificationMessage, id);
        this.db.prepare("UPDATE notifications SET status = 'sent', attempts = ?, sent_at = ?, last_error = NULL WHERE id = ?").run(attempts, this.now().toISOString(), id);
        totals.sent += 1;
      } catch (error) {
        const retryable = error instanceof BotSendError ? error.retryable : true;
        const reason = (error instanceof Error ? error.message : String(error)).slice(0, 300);
        const delay = this.retryDelaysMs[attempts - 1];
        if (retryable && delay !== undefined) {
          this.db.prepare('UPDATE notifications SET attempts = ?, next_attempt_at = ?, last_error = ? WHERE id = ?').run(attempts, new Date(this.now().getTime() + delay).toISOString(), reason, id);
          totals.retrying += 1;
        } else {
          this.db.prepare("UPDATE notifications SET status = 'failed', attempts = ?, last_error = ? WHERE id = ?").run(attempts, reason, id);
          this.options.log?.('notification failed permanently', { id, recipient: String(row.recipient_open_id), reason });
          totals.failed += 1;
        }
      }
    }
    return totals;
  }

  summary() {
    const rows = this.db.prepare('SELECT status, COUNT(*) AS n FROM notifications GROUP BY status').all();
    return Object.fromEntries(rows.map((row) => [String(row.status), Number(row.n)]));
  }

  // Counts plus the latest failure reasons, enough to tell a missing Feishu permission from an outage.
  diagnostics() {
    const failures = this.db
      .prepare("SELECT kind, attempts, last_error, created_at FROM notifications WHERE last_error IS NOT NULL ORDER BY created_at DESC LIMIT 5")
      .all()
      .map((row) => ({ kind: String(row.kind), attempts: Number(row.attempts), error: String(row.last_error), createdAt: String(row.created_at) }));
    return { counts: this.summary(), recentFailures: failures };
  }

  // --- Domain notifications -------------------------------------------------

  submissionPending(submission: SubmissionRef & { notes?: string }): void {
    for (const openId of this.openIdsWithRole('reviewer')) {
      this.enqueue('submission.pending', openId, `submission.pending:${submission.id}:${openId}`, {
        title: '新的工具投稿待审核',
        color: 'blue',
        lines: [`**${clip(submission.slug)}**`, `投稿人：${clip(submission.submitter)}`, ...(submission.notes ? [`说明：${clip(submission.notes)}`] : [])],
        link: this.link('前往审核', '#admin')
      });
    }
  }

  reviewed(submission: SubmissionRef, review: { id: string; reviewer: string; decision: string; comment?: string }): void {
    const target = this.resolveMember(submission.submitter);
    if (!target) {
      this.options.log?.('review notification skipped: submitter is not a known member', { submitter: submission.submitter, submissionId: submission.id });
      return;
    }
    const approved = review.decision === 'approved';
    const label = approved ? '已通过并上架' : review.decision === 'rejected' ? '已驳回' : '需要修改';
    this.enqueue('submission.reviewed', target, `submission.reviewed:${review.id}`, {
      title: `投稿审核结果：${label}`,
      color: approved ? 'green' : review.decision === 'rejected' ? 'red' : 'orange',
      lines: [`**${clip(submission.slug)}**`, `审核人：${clip(review.reviewer)}`, ...(review.comment ? [`意见：${clip(review.comment)}`] : [])],
      link: this.link(approved ? '打开 Tool Hub' : '查看投稿', approved ? '' : '#me')
    });
  }

  toolListed(submission: SubmissionRef, version?: string): void {
    const submitter = this.resolveMember(submission.submitter);
    const rows = this.db.prepare("SELECT open_id FROM users WHERE status = 'active' AND notify_listed = 1").all();
    for (const row of rows) {
      const openId = String(row.open_id);
      if (openId === submitter) {
        continue;
      }
      this.enqueue('tool.listed', openId, `tool.listed:${submission.id}:${openId}`, {
        title: '新工具上架',
        color: 'green',
        lines: [`**${clip(submission.slug)}**${version ? ` v${clip(version)}` : ''}`, `作者：${clip(submission.submitter)}`],
        link: this.link('查看工具', '')
      });
    }
  }

  feedbackCreated(feedback: FeedbackRef): void {
    for (const openId of this.openIdsWithRole('admin')) {
      if (openId === feedback.authorOpenId) continue;
      this.enqueue('feedback.created', openId, `feedback.created:${feedback.id}:${openId}`, {
        title: feedback.kind === 'bug' ? '新的问题反馈' : '新的功能建议',
        color: 'blue',
        lines: [`**${clip(feedback.title)}**`, `提交人：${clip(feedback.authorName)}`, clip(feedback.body)],
        link: this.link('前往处理', '#admin')
      });
    }
  }

  // Staff replies reach the author; author replies reach the assignee, or the admins when nobody is assigned.
  feedbackReplied(feedback: FeedbackRef, reply: { id: string; authorOpenId: string; authorName: string; body: string; staff: boolean }): void {
    const recipients = reply.staff ? [feedback.authorOpenId] : feedback.assigneeOpenId ? [feedback.assigneeOpenId] : this.openIdsWithRole('admin');
    for (const openId of recipients) {
      if (openId === reply.authorOpenId) continue;
      this.enqueue('feedback.reply', openId, `feedback.reply:${reply.id}:${openId}`, {
        title: reply.staff ? '你的反馈有新回复' : '反馈有新的补充',
        color: 'blue',
        lines: [`**${clip(feedback.title)}**`, `${clip(reply.authorName)}：${clip(reply.body)}`],
        link: this.link(reply.staff ? '查看回复' : '前往处理', reply.staff ? '#me' : '#admin')
      });
    }
  }

  feedbackStatusChanged(feedback: FeedbackRef, status: string, changedBy: string): void {
    const label: Record<string, string> = { open: '待处理', in_progress: '处理中', resolved: '已解决', wontfix: '暂不处理' };
    const done = status === 'resolved';
    this.enqueue('feedback.status', feedback.authorOpenId, `feedback.status:${feedback.id}:${status}:${feedback.updatedAt}`, {
      title: `反馈状态更新：${label[status] ?? status}`,
      color: done ? 'green' : status === 'wontfix' ? 'grey' : 'blue',
      lines: [`**${clip(feedback.title)}**`, `处理人：${clip(changedBy)}`],
      link: this.link('查看详情', '#me')
    });
  }

  feedbackAssigned(feedback: FeedbackRef, assigneeOpenId: string): void {
    this.enqueue('feedback.assigned', assigneeOpenId, `feedback.assigned:${feedback.id}:${assigneeOpenId}:${feedback.updatedAt}`, {
      title: '有反馈分派给你',
      color: 'orange',
      lines: [`**${clip(feedback.title)}**`, `提交人：${clip(feedback.authorName)}`, clip(feedback.body)],
      link: this.link('前往处理', '#admin')
    });
  }

  // Active user ids for a role; admins also count as reviewers.
  openIdsWithRole(role: 'reviewer' | 'admin'): string[] {
    const roles = role === 'reviewer' ? ['reviewer', 'admin'] : ['admin'];
    const rows = this.db
      .prepare(`SELECT DISTINCT r.open_id FROM user_roles r JOIN users u ON u.open_id = r.open_id WHERE u.status = 'active' AND r.role IN (${roles.map(() => '?').join(',')})`)
      .all(...roles);
    return rows.map((row) => String(row.open_id));
  }

  // Free-text submitter -> exactly one active member by name, email, email local part or person alias.
  resolveMember(text: string): string | undefined {
    const needle = text.trim().toLowerCase();
    if (!needle) {
      return undefined;
    }
    const rows = this.db
      .prepare(
        `SELECT DISTINCT open_id FROM users WHERE status = 'active' AND (
           lower(name) = ? OR lower(email) = ? OR (email IS NOT NULL AND lower(substr(email, 1, instr(email, '@') - 1)) = ?)
           OR open_id IN (SELECT open_id FROM author_aliases WHERE kind = 'person' AND alias = ? COLLATE NOCASE)
         )`
      )
      .all(needle, needle, needle, needle);
    return rows.length === 1 ? String(rows[0].open_id) : undefined;
  }

  link(text: string, hash: string): NotificationMessage['link'] {
    return this.baseUrl ? { text, url: `${this.baseUrl}/${hash}` } : undefined;
  }
}

export function clip(value: string, max = maxText): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}
