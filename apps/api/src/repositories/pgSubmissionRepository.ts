import crypto from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { submissionRecordSchema } from '@tapython-tool-hub/shared';
import type { ReviewRecord, SubmissionAssetPayload, SubmissionRecord, ToolSubmissionRequest, ValidationReport } from '@tapython-tool-hub/shared';
import type { SubmissionRepository } from './submissionRepository.js';

interface SubmissionRow {
  id: string;
  slug: string;
  submitter: string;
  status: SubmissionRecord['status'];
  payload: {
    assets?: SubmissionAssetPayload[];
    notes?: string;
  };
  markdown: string;
  validation_report: ValidationReport;
  created_at: Date;
  updated_at: Date;
}

interface ReviewRow {
  id: string;
  reviewer: string;
  decision: ReviewRecord['decision'];
  comment: string | null;
  created_at: Date;
}

export class PgSubmissionRepository implements SubmissionRepository {
  constructor(private readonly pool: Pool) {}

  async list(): Promise<SubmissionRecord[]> {
    const { rows } = await this.pool.query<SubmissionRow>(
      `select id, slug, submitter, status, payload, markdown, validation_report, created_at, updated_at
       from submissions
       order by updated_at desc`
    );
    return Promise.all(rows.map((row) => this.toRecord(row)));
  }

  async get(id: string): Promise<SubmissionRecord | undefined> {
    const { rows } = await this.pool.query<SubmissionRow>(
      `select id, slug, submitter, status, payload, markdown, validation_report, created_at, updated_at
       from submissions
       where id = $1`,
      [id]
    );
    const row = rows[0];
    return row ? this.toRecord(row) : undefined;
  }

  async create(request: ToolSubmissionRequest, validationReport: ValidationReport): Promise<SubmissionRecord> {
    const id = crypto.randomUUID();
    const status: SubmissionRecord['status'] = validationReport.valid ? 'pending' : 'draft';
    const { rows } = await this.pool.query<SubmissionRow>(
      `insert into submissions (id, slug, submitter, status, payload, markdown, validation_report)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id, slug, submitter, status, payload, markdown, validation_report, created_at, updated_at`,
      [
        id,
        request.slug,
        request.submitter,
        status,
        { assets: request.assets, notes: request.notes },
        request.markdown,
        validationReport
      ]
    );
    return this.toRecord(rows[0]);
  }

  async save(submission: SubmissionRecord): Promise<SubmissionRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const { rows } = await client.query<SubmissionRow>(
        `update submissions
         set status = $2,
             payload = $3,
             markdown = $4,
             validation_report = $5,
             updated_at = now()
         where id = $1
         returning id, slug, submitter, status, payload, markdown, validation_report, created_at, updated_at`,
        [
          submission.id,
          submission.status,
          { assets: submission.assets, notes: submission.notes },
          submission.markdown,
          submission.validationReport
        ]
      );
      if (!rows[0]) {
        throw new Error(`Submission not found: ${submission.id}`);
      }

      await client.query('delete from reviews where submission_id = $1', [submission.id]);
      for (const review of [...submission.reviews].reverse()) {
        await client.query(
          `insert into reviews (id, submission_id, reviewer, decision, comment, created_at)
           values ($1, $2, $3, $4, $5, $6)`,
          [review.id, submission.id, review.reviewer, review.decision, review.comment, review.createdAt]
        );
      }

      await client.query('commit');
      return this.toRecord(rows[0], client);
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async delete(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('delete from submissions where id = $1', [id]);
    return (rowCount ?? 0) > 0;
  }

  private async toRecord(row: SubmissionRow, client: Pool | PoolClient = this.pool): Promise<SubmissionRecord> {
    const { rows } = await client.query<ReviewRow>(
      `select id, reviewer, decision, comment, created_at
       from reviews
       where submission_id = $1
       order by created_at desc`,
      [row.id]
    );

    return submissionRecordSchema.parse({
      id: row.id,
      slug: row.slug,
      submitter: row.submitter,
      status: row.status,
      markdown: row.markdown,
      assets: row.payload.assets ?? [],
      notes: row.payload.notes,
      validationReport: row.validation_report,
      reviews: rows.map((review) => ({
        id: review.id,
        reviewer: review.reviewer,
        decision: review.decision,
        comment: review.comment ?? undefined,
        createdAt: review.created_at.toISOString()
      })),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    });
  }
}