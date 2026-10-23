import assert from 'node:assert/strict';
import test from 'node:test';
import { memoryDb } from '../testSupport/submissions.js';
import { StatsService } from './statsService.js';

const now = () => new Date('2026-10-24T04:00:00Z');

async function seeded() {
  const db = await memoryDb();
  const user = db.prepare("INSERT INTO users (open_id, name, email, department, created_at) VALUES (?, ?, ?, ?, 'x')");
  user.run('ou_a', 'Alice', 'a@example.com', 'Dept A');
  user.run('ou_b', 'Bob', 'b@example.com', 'Dept B');
  db.prepare("UPDATE users SET team = 'Override' WHERE open_id = 'ou_b'").run();

  const tool = db.prepare("INSERT INTO tools (slug, name, display_name, category, author, owner_team, status, updated_at, synced_at) VALUES (?, ?, ?, ?, ?, ?, 'approved', ?, 'x')");
  tool.run('t1', 'T1', 'Tool One', 'utility', 'alice-nick', 'Team X', '2026-10-01');
  tool.run('t2', 'T2', 'Tool Two', 'utility', 'Team Author', 'Team X', '2026-10-10');
  tool.run('t3', 'T3', 'Tool Three', 'rendering', 'stranger', 'Team Y', '2026-09-01');
  const version = db.prepare("INSERT INTO tool_versions (slug, version, released_at, author) VALUES (?, ?, ?, ?)");
  version.run('t1', '1.0.0', '2026-09-10', 'alice-nick');
  version.run('t1', '1.1.0', '2026-10-01', 'alice-nick');
  version.run('t2', '1.0.0', '2026-10-10', 'Team Author');
  version.run('t3', '1.0.0', '2026-09-01', 'stranger');

  db.prepare("INSERT INTO author_aliases (alias, kind, open_id, created_by, created_at) VALUES ('Alice-Nick', 'person', 'ou_a', 't', 'x')").run();
  db.prepare("INSERT INTO author_aliases (alias, kind, created_by, created_at) VALUES ('Team Author', 'team', 't', 'x')").run();

  const event = db.prepare("INSERT INTO events (event_id, type, at, slug, version, source) VALUES (?, ?, ?, ?, ?, 'server')");
  event.run('e1', 'download.package', '2026-10-23T20:30:00Z', 't1', '1.1.0');
  event.run('e2', 'download.package', '2026-10-23T20:31:00Z', 't1', '1.1.0');
  event.run('e3', 'download.package', '2026-10-20T01:00:00Z', 't2', '1.0.0');
  event.run('e4', 'download.manifest', '2026-10-23T20:30:00Z', 't1', '1.1.0');
  event.run('e5', 'download.package', '2026-08-01T00:00:00Z', 't3', '1.0.0');

  const sub = db.prepare("INSERT INTO submissions (id, slug, submitter, status, record, created_at, updated_at) VALUES (?, ?, 's', ?, '{}', ?, ?)");
  sub.run('s1', 't1', 'approved', '2026-10-20T00:00:00Z', 'x');
  sub.run('s2', 't2', 'pending', '2026-10-22T00:00:00Z', 'x');
  sub.run('s3', 't3', 'rejected', '2026-10-21T00:00:00Z', 'x');
  const review = db.prepare("INSERT INTO submission_reviews (review_id, submission_id, seq, reviewer, reviewer_open_id, decision, created_at) VALUES (?, ?, 0, ?, ?, ?, ?)");
  review.run('r1', 's1', 'Bob', 'ou_b', 'approved', '2026-10-20T06:00:00Z');
  review.run('r2', 's3', 'admin', null, 'rejected', '2026-10-21T02:00:00Z');
  return new StatsService(db, { now });
}

test('platform totals, groupings, local-day download series and top tools', async () => {
  const stats = (await seeded()).platform();
  assert.equal(stats.tools.total, 3);
  assert.equal(stats.tools.versions, 4);
  assert.deepEqual(stats.tools.byTeam, [{ name: 'Team X', count: 2 }, { name: 'Team Y', count: 1 }]);
  assert.deepEqual(stats.tools.byCategory[0], { name: 'utility', count: 2 });

  assert.equal(stats.downloads.total, 4, 'only package downloads count, every one of them');
  assert.equal(stats.downloads.last30Days, 3);
  assert.equal(stats.downloads.daily.length, 30);
  // 20:30Z on the 23rd is already the 24th in UTC+8, and "now" (04:00Z) is the 24th as well.
  assert.deepEqual(stats.downloads.daily.at(-1), { day: '2026-10-24', downloads: 2 });
  assert.deepEqual(stats.downloads.topAllTime.map((t) => [t.slug, t.name, t.downloads]), [['t1', 'Tool One', 2], ['t2', 'Tool Two', 1], ['t3', 'Tool Three', 1]]);
  assert.deepEqual(stats.downloads.topLast30Days.map((t) => t.slug), ['t1', 't2']);
  assert.deepEqual(stats.releasesByMonth, [{ month: '2026-09', versions: 2 }, { month: '2026-10', versions: 2 }]);
  assert.deepEqual(stats.reach, { devices30d: 0, users30d: 0, installs30d: 0 });
});

test('process metrics: statuses, first-review latency, approval rate and oldest pending', async () => {
  const stats = (await seeded()).process();
  assert.equal(stats.submissions.total, 3);
  assert.equal(stats.pending.count, 1);
  assert.equal(Math.round(stats.pending.oldestAgeHours ?? 0), 52);
  assert.deepEqual(stats.review.decisions, { approved: 1, rejected: 1, changesRequested: 0 });
  assert.equal(stats.review.approvalRate, 0.5);
  assert.deepEqual({ ...stats.review.firstReviewHours, average: Math.round(stats.review.firstReviewHours.average ?? 0) }, { median: 6, average: 4, samples: 2 });
});

test('contribution resolves authors through aliases and keeps unbound names visible', async () => {
  const stats = (await seeded()).contribution();
  assert.deepEqual(stats.teams.map((t) => [t.team, t.tools, t.versions, t.downloads]), [['Team X', 2, 3, 3], ['Team Y', 1, 1, 1]]);

  const alice = stats.people.find((p) => p.openId === 'ou_a')!;
  assert.deepEqual({ tools: alice.tools, versions: alice.versions, downloads: alice.downloads, team: alice.team, aliases: alice.aliases }, { tools: 1, versions: 2, downloads: 2, team: 'Dept A', aliases: ['alice-nick'] });
  const bob = stats.people.find((p) => p.openId === 'ou_b')!;
  assert.deepEqual({ tools: bob.tools, reviews: bob.reviews, team: bob.team }, { tools: 0, reviews: 1, team: 'Override' });

  assert.deepEqual(stats.teamAuthors.map((a) => a.name), ['Team Author']);
  assert.deepEqual(stats.unbound.map((a) => [a.name, a.downloads]), [['stranger', 1]]);
  assert.equal(stats.legacyReviews, 1);
});
