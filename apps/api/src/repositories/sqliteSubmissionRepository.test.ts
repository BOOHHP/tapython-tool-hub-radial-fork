import assert from 'node:assert/strict';
import test from 'node:test';
import { SqliteSubmissionRepository } from './sqliteSubmissionRepository.js';
import { memoryDb } from '../testSupport/submissions.js';

const request = { slug: 'demo-tool', submitter: 'junfeng', markdown: '# demo', assets: [] };

test('create stores pending for valid reports and draft for invalid ones', async () => {
  const db = await memoryDb();
  const repo = new SqliteSubmissionRepository(db);
  assert.equal((await repo.create(request, { valid: true, issues: [] })).status, 'pending');
  assert.equal((await repo.create(request, { valid: false, issues: [{ level: 'error', message: 'x' }] })).status, 'draft');
});

test('get, list ordering, save and delete behave like the file repository', async () => {
  let clock = Date.parse('2026-02-01T00:00:00Z');
  const db = await memoryDb();
  const repo = new SqliteSubmissionRepository(db, () => new Date((clock += 1000)));
  const first = await repo.create(request, { valid: true, issues: [] });
  const second = await repo.create({ ...request, slug: 'other-tool' }, { valid: true, issues: [] });

  assert.deepEqual((await repo.list()).map((s) => s.id), [second.id, first.id]);
  assert.equal(await repo.get('../etc/passwd'), undefined);
  assert.equal(await repo.get('00000000-0000-0000-0000-000000000000'), undefined);

  const saved = await repo.save({ ...first, status: 'approved', reviews: [{ id: 'r1', reviewer: 'admin', decision: 'approved', comment: 'ok', createdAt: '2026-02-02T00:00:00.000Z' }] });
  assert.ok(saved.updatedAt > first.updatedAt);
  assert.deepEqual((await repo.list()).map((s) => s.id), [first.id, second.id]);
  assert.equal((await repo.get(first.id))?.reviews[0].comment, 'ok');
  assert.equal(Number(db.prepare('SELECT COUNT(*) AS n FROM submission_reviews').get()?.n), 1);

  assert.equal(await repo.delete(first.id), true);
  assert.equal(await repo.delete(first.id), false);
  assert.equal(Number(db.prepare('SELECT COUNT(*) AS n FROM submission_reviews').get()?.n), 0);
});

test('saving rewrites review rows from the record instead of appending', async () => {
  const db = await memoryDb();
  const repo = new SqliteSubmissionRepository(db);
  const created = await repo.create(request, { valid: true, issues: [] });
  const review = { id: 'r1', reviewer: 'admin', decision: 'changes_requested' as const, createdAt: '2026-02-02T00:00:00.000Z' };
  await repo.save({ ...created, reviews: [review] });
  await repo.save({ ...created, reviews: [review, { ...review, id: 'r2', decision: 'approved' }] });
  assert.deepEqual(db.prepare('SELECT review_id, seq FROM submission_reviews ORDER BY seq').all().map((r) => ({ ...r })), [{ review_id: 'r1', seq: 0 }, { review_id: 'r2', seq: 1 }]);
});

test('migration 003 enforces alias rules', async () => {
  const db = await memoryDb();
  assert.throws(() => db.prepare("INSERT INTO author_aliases (alias, kind, created_by, created_at) VALUES ('x', 'person', 'm', 'now')").run());
  db.prepare("INSERT INTO author_aliases (alias, kind, created_by, created_at) VALUES ('Team', 'team', 'm', 'now')").run();
  assert.throws(() => db.prepare("INSERT INTO author_aliases (alias, kind, created_by, created_at) VALUES ('team', 'team', 'm', 'now')").run());
});
