import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { memoryDb, sampleRecord } from '../testSupport/submissions.js';
import { importSubmissions, verifySubmissions } from './submissionImport.js';

function sourceDir(files: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tapython-import-'));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content, 'utf8');
  }
  return dir;
}

const idA = 'aaaaaaaa-0000-0000-0000-000000000001';
const idB = 'bbbbbbbb-0000-0000-0000-000000000002';
const withReview = sampleRecord(idB, {
  status: 'approved',
  submitter: '吴俊枫',
  reviews: [{ id: 'rev-1', reviewer: 'TA Admin', decision: 'approved', comment: '好', createdAt: '2026-01-02T00:00:00.000Z' }]
});
const json = (record: unknown) => `${JSON.stringify(record, null, 2)}\n`;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

function standardSource() {
  return sourceDir({ [`${idA}.json`]: `\uFEFF${json(sampleRecord(idA))}`, [`${idB}.json`]: json(withReview), 'not-a-submission.txt': 'ignored' });
}

test('import is idempotent and keeps submitter text and review history as written', async () => {
  const db = await memoryDb();
  const dir = standardSource();
  const first = importSubmissions(db, dir);
  assert.deepEqual({ found: first.found, inserted: first.inserted, reviews: first.reviewsImported }, { found: 2, inserted: 2, reviews: 1 });

  const again = importSubmissions(db, dir);
  assert.deepEqual({ inserted: again.inserted, unchanged: again.unchanged }, { inserted: 0, unchanged: 2 });

  assert.equal(db.prepare('SELECT submitter FROM submissions WHERE id = ?').get(idB)?.submitter, '吴俊枫');
  assert.equal(db.prepare('SELECT reviewer FROM submission_reviews').get()?.reviewer, 'TA Admin');
  assert.equal(db.prepare('SELECT reviewer_open_id FROM submission_reviews').get()?.reviewer_open_id, null);
  assert.equal(db.prepare("SELECT kind FROM author_aliases WHERE alias = 'scene c team'").get()?.kind, 'team');
});

test('dry run reports what would happen and changes nothing', async () => {
  const db = await memoryDb();
  const report = importSubmissions(db, standardSource(), { dryRun: true });
  assert.equal(report.inserted, 2);
  assert.equal(report.dryRun, true);
  assert.equal(Number(db.prepare('SELECT COUNT(*) AS n FROM submissions').get()?.n), 0);
  assert.equal(Number(db.prepare('SELECT COUNT(*) AS n FROM author_aliases').get()?.n), 0);
});

test('a differing source is a conflict and never overwrites the stored record', async () => {
  const db = await memoryDb();
  const dir = standardSource();
  importSubmissions(db, dir);
  fs.writeFileSync(path.join(dir, `${idA}.json`), json(sampleRecord(idA, { markdown: '# changed' })), 'utf8');
  const report = importSubmissions(db, dir);
  assert.deepEqual(report.conflicts, [idA]);
  assert.equal(JSON.parse(String(db.prepare('SELECT record FROM submissions WHERE id = ?').get(idA)?.record)).markdown, '# demo');
});

test('one unreadable file aborts the whole import', async () => {
  const db = await memoryDb();
  const dir = sourceDir({ [`${idA}.json`]: json(sampleRecord(idA)), 'cccccccc-0000-0000-0000-000000000003.json': '{ broken' });
  const report = importSubmissions(db, dir);
  assert.equal(report.invalid.length, 1);
  assert.equal(Number(db.prepare('SELECT COUNT(*) AS n FROM submissions').get()?.n), 0);
});

test('a file whose name does not match its id is rejected', async () => {
  const db = await memoryDb();
  const report = importSubmissions(db, sourceDir({ 'wrong-name.json': json(sampleRecord(idA)) }));
  assert.match(report.invalid[0].error, /does not match id/);
});

test('verify passes after import and flags tampering, missing rows and baseline drift', async () => {
  const db = await memoryDb();
  const dir = standardSource();
  assert.equal(verifySubmissions(db, dir).ok, false);

  importSubmissions(db, dir);
  const inventory = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tapython-inventory-')), 'inventory.json');
  const records = [idA, idB].map((id) => ({ id, sha256: sha(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8')) }));
  fs.writeFileSync(inventory, JSON.stringify({ submissionRecords: { total: 2, reviewEntries: 1, records } }), 'utf8');
  assert.deepEqual(verifySubmissions(db, dir, inventory), { ok: true, submissions: 2, reviews: 1, problems: [] });

  db.prepare('UPDATE submission_reviews SET comment = ? WHERE review_id = ?').run('tampered', 'rev-1');
  assert.match(verifySubmissions(db, dir).problems.join('\n'), /reviews differ/);

  db.prepare('DELETE FROM submissions WHERE id = ?').run(idA);
  assert.match(verifySubmissions(db, dir).problems.join('\n'), /missing in database/);

  fs.writeFileSync(inventory, JSON.stringify({ submissionRecords: { total: 3, reviewEntries: 1, records: [...records, { id: 'extra', sha256: 'x' }] } }), 'utf8');
  assert.match(verifySubmissions(db, dir, inventory).problems.join('\n'), /baseline but not in source/);
});
