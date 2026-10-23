import crypto from 'node:crypto';
import { submissionRecordSchema } from '@tapython-tool-hub/shared';
import type { SubmissionRecord, ToolSubmissionRequest, ValidationReport } from '@tapython-tool-hub/shared';
import type { SqliteDatabase } from '../database/sqlite.js';
import type { SubmissionRepository } from './submissionRepository.js';

const idPattern = /^[a-f0-9-]+$/;

export class SqliteSubmissionRepository implements SubmissionRepository {
  constructor(private readonly db: SqliteDatabase, private readonly now: () => Date = () => new Date()) {}

  async list(): Promise<SubmissionRecord[]> {
    return this.db
      .prepare('SELECT record FROM submissions ORDER BY updated_at DESC, id')
      .all()
      .map((row) => parseRecord(row.record));
  }

  async get(id: string): Promise<SubmissionRecord | undefined> {
    if (!idPattern.test(id)) {
      return undefined;
    }
    const row = this.db.prepare('SELECT record FROM submissions WHERE id = ?').get(id);
    return row ? parseRecord(row.record) : undefined;
  }

  async create(request: ToolSubmissionRequest, validationReport: ValidationReport): Promise<SubmissionRecord> {
    const stamp = this.now().toISOString();
    return this.write({
      id: crypto.randomUUID(),
      slug: request.slug,
      submitter: request.submitter,
      status: validationReport.valid ? 'pending' : 'draft',
      markdown: request.markdown,
      assets: request.assets,
      notes: request.notes,
      validationReport,
      reviews: [],
      createdAt: stamp,
      updatedAt: stamp
    });
  }

  async save(submission: SubmissionRecord): Promise<SubmissionRecord> {
    return this.write({ ...submission, updatedAt: this.now().toISOString() });
  }

  async delete(id: string): Promise<boolean> {
    if (!idPattern.test(id)) {
      return false;
    }
    return Number(this.db.prepare('DELETE FROM submissions WHERE id = ?').run(id).changes) > 0;
  }

  private write(candidate: SubmissionRecord): SubmissionRecord {
    const record = submissionRecordSchema.parse(candidate);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      storeSubmission(this.db, record);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return record;
  }
}

function parseRecord(raw: unknown): SubmissionRecord {
  return submissionRecordSchema.parse(JSON.parse(String(raw)));
}

// Caller owns the transaction. Reviews are rewritten from the record so the two never drift apart.
export function storeSubmission(db: SqliteDatabase, record: SubmissionRecord, sourceSha256?: string): void {
  db.prepare(
    `INSERT INTO submissions (id, slug, submitter, status, record, created_at, updated_at, source_sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET slug = excluded.slug, submitter = excluded.submitter, status = excluded.status, record = excluded.record,
       updated_at = excluded.updated_at, source_sha256 = COALESCE(excluded.source_sha256, source_sha256)`
  ).run(record.id, record.slug, record.submitter, record.status, JSON.stringify(record), record.createdAt, record.updatedAt, sourceSha256 ?? null);

  db.prepare('DELETE FROM submission_reviews WHERE submission_id = ?').run(record.id);
  const insert = db.prepare(
    'INSERT INTO submission_reviews (review_id, submission_id, seq, reviewer, decision, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  record.reviews.forEach((review, seq) => insert.run(review.id, record.id, seq, review.reviewer, review.decision, review.comment ?? null, review.createdAt));
}
