import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { submissionRecordSchema } from '@tapython-tool-hub/shared';
import type { SubmissionRecord } from '@tapython-tool-hub/shared';
import type { SqliteDatabase } from '../database/sqlite.js';
import { storeSubmission } from '../repositories/sqliteSubmissionRepository.js';

export interface ImportReport {
  found: number;
  inserted: number;
  unchanged: number;
  conflicts: string[];
  invalid: Array<{ file: string; error: string }>;
  reviewsImported: number;
  dryRun: boolean;
}

interface SourceRecord {
  file: string;
  record: SubmissionRecord;
  sha256: string;
}

const teamAliases = ['Scene C Team'];

function readSources(submissionRoot: string): { sources: SourceRecord[]; invalid: ImportReport['invalid'] } {
  const sources: SourceRecord[] = [];
  const invalid: ImportReport['invalid'] = [];
  const names = fs.existsSync(submissionRoot) ? fs.readdirSync(submissionRoot).filter((name) => name.endsWith('.json')).sort() : [];
  for (const file of names) {
    try {
      const raw = fs.readFileSync(path.join(submissionRoot, file));
      const record = submissionRecordSchema.parse(JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, '')));
      if (file !== `${record.id}.json`) {
        throw new Error(`file name does not match id ${record.id}`);
      }
      sources.push({ file, record, sha256: createHash('sha256').update(raw).digest('hex') });
    } catch (error) {
      invalid.push({ file, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { sources, invalid };
}

// Idempotent and non-destructive: existing rows are never overwritten, a differing source is reported instead.
export function importSubmissions(db: SqliteDatabase, submissionRoot: string, options: { dryRun?: boolean; now?: () => Date } = {}): ImportReport {
  const { sources, invalid } = readSources(submissionRoot);
  const report: ImportReport = { found: sources.length + invalid.length, inserted: 0, unchanged: 0, conflicts: [], invalid, reviewsImported: 0, dryRun: Boolean(options.dryRun) };
  const stamp = (options.now ?? (() => new Date()))().toISOString();

  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = db.prepare('SELECT source_sha256 FROM submissions WHERE id = ?');
    for (const { record, sha256 } of sources) {
      const row = existing.get(record.id);
      if (!row) {
        storeSubmission(db, record, sha256);
        report.inserted += 1;
        report.reviewsImported += record.reviews.length;
      } else if (row.source_sha256 === sha256) {
        report.unchanged += 1;
      } else {
        report.conflicts.push(record.id);
      }
    }
    for (const alias of teamAliases) {
      db.prepare("INSERT INTO author_aliases (alias, kind, created_by, created_at) VALUES (?, 'team', 'migration', ?) ON CONFLICT(alias) DO NOTHING").run(alias, stamp);
    }
    db.exec(options.dryRun || invalid.length > 0 ? 'ROLLBACK' : 'COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  if (invalid.length > 0) {
    report.dryRun = true;
  }
  return report;
}

export interface VerifyReport {
  ok: boolean;
  submissions: number;
  reviews: number;
  problems: string[];
}

interface BaselineInventory {
  submissionRecords?: { total: number; reviewEntries: number; records: Array<{ id: string; sha256: string }> };
}

// Pre-cutover check: every source file must be in the database byte-for-byte (by hash) and field-for-field.
export function verifySubmissions(db: SqliteDatabase, submissionRoot: string, inventoryPath?: string): VerifyReport {
  const { sources, invalid } = readSources(submissionRoot);
  const problems = invalid.map((item) => `unreadable source ${item.file}: ${item.error}`);
  const read = db.prepare('SELECT record, source_sha256 FROM submissions WHERE id = ?');

  for (const { record, sha256 } of sources) {
    const row = read.get(record.id);
    if (!row) {
      problems.push(`missing in database: ${record.id}`);
      continue;
    }
    if (row.source_sha256 !== sha256) {
      problems.push(`source hash differs: ${record.id}`);
    }
    if (!isDeepStrictEqual(submissionRecordSchema.parse(JSON.parse(String(row.record))), record)) {
      problems.push(`record differs: ${record.id}`);
    }
    const stored = db.prepare('SELECT review_id, reviewer, decision, comment, created_at FROM submission_reviews WHERE submission_id = ? ORDER BY seq').all(record.id);
    const expected = record.reviews.map((r) => ({ review_id: r.id, reviewer: r.reviewer, decision: r.decision, comment: r.comment ?? null, created_at: r.createdAt }));
    if (!isDeepStrictEqual(stored.map((r) => ({ ...r })), expected)) {
      problems.push(`reviews differ: ${record.id}`);
    }
  }

  const submissions = Number(db.prepare('SELECT COUNT(*) AS n FROM submissions').get()?.n ?? 0);
  const reviews = Number(db.prepare('SELECT COUNT(*) AS n FROM submission_reviews').get()?.n ?? 0);

  if (inventoryPath) {
    const baseline = (JSON.parse(fs.readFileSync(inventoryPath, 'utf8').replace(/^\uFEFF/, '')) as BaselineInventory).submissionRecords;
    if (!baseline) {
      problems.push('inventory has no submissionRecords');
    } else {
      const byId = new Map(baseline.records.map((r) => [r.id, r.sha256]));
      for (const { record, sha256 } of sources) {
        if (byId.get(record.id) !== sha256) {
          problems.push(`differs from baseline inventory: ${record.id}`);
        }
      }
      for (const id of byId.keys()) {
        if (!sources.some((s) => s.record.id === id)) {
          problems.push(`in baseline but not in source files: ${id}`);
        }
      }
      if (submissions !== baseline.total) {
        problems.push(`database has ${submissions} submissions, baseline has ${baseline.total}`);
      }
      if (reviews !== baseline.reviewEntries) {
        problems.push(`database has ${reviews} reviews, baseline has ${baseline.reviewEntries}`);
      }
    }
  }
  return { ok: problems.length === 0, submissions, reviews, problems };
}
