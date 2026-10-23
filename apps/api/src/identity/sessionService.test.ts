import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadMigrations, migrate } from '../database/migrate.js';
import { openSqlite } from '../database/sqlite.js';
import { SessionService } from './sessionService.js';
import { UserRepository } from './userRepository.js';

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'db', 'sqlite-migrations');
const secret = 'test-secret-test-secret-test-secret';

async function setup() {
  const db = openSqlite(':memory:');
  migrate(db, await loadMigrations(migrationsDir));
  let nowMs = Date.UTC(2026, 9, 23, 0, 0, 0);
  const clock = { now: () => new Date(nowMs), advance: (ms: number) => { nowMs += ms; } };
  const users = new UserRepository(db, { now: clock.now });
  users.upsertFromFeishu({ openId: 'ou_alice', name: 'Alice', email: 'alice@example.com' });
  const sessions = new SessionService(db, users, { secret, now: clock.now, accessTtlMs: 15 * 60_000, refreshTtlMs: 30 * 24 * 3600_000 });
  return { db, users, sessions, clock };
}

test('a new session yields an access token that resolves to the user', async () => {
  const { db, sessions } = await setup();
  const issued = sessions.createSession('ou_alice', 'installer', 'dev-1');
  const auth = sessions.verifyAccessToken(issued.accessToken);
  assert.equal(auth?.user.openId, 'ou_alice');
  assert.equal(auth?.sessionId, issued.sessionId);
  assert.equal(auth?.client, 'installer');
  db.close();
});

test('refresh tokens are stored only as hashes', async () => {
  const { db, sessions } = await setup();
  const issued = sessions.createSession('ou_alice', 'web');
  const rows = db.prepare('SELECT refresh_hash FROM sessions').all();
  assert.equal(rows.length, 1);
  assert.notEqual(rows[0].refresh_hash, issued.refreshToken);
  assert.match(String(rows[0].refresh_hash), /^[0-9a-f]{64}$/);
  db.close();
});

test('expired, tampered and foreign tokens are rejected', async () => {
  const { db, sessions, clock } = await setup();
  const issued = sessions.createSession('ou_alice', 'cli');

  const [version, payload, signature] = issued.accessToken.split('.');
  assert.equal(sessions.verifyAccessToken(`${version}.${payload}.${signature.slice(0, -2)}AA`), undefined);
  const forgedPayload = Buffer.from(JSON.stringify({ sub: 'ou_admin', sid: issued.sessionId, exp: 9999999999999 })).toString('base64url');
  assert.equal(sessions.verifyAccessToken(`${version}.${forgedPayload}.${signature}`), undefined);
  assert.equal(sessions.verifyAccessToken('garbage'), undefined);

  const other = new SessionService(db, new UserRepository(db), { secret: 'another-secret-another-secret-123', now: clock.now });
  assert.equal(other.verifyAccessToken(issued.accessToken), undefined);

  clock.advance(15 * 60_000 + 1);
  assert.equal(sessions.verifyAccessToken(issued.accessToken), undefined);
  db.close();
});

test('revoked sessions and users who left stop working immediately', async () => {
  const { db, users, sessions } = await setup();
  const first = sessions.createSession('ou_alice', 'web');
  sessions.revoke(first.sessionId);
  assert.equal(sessions.verifyAccessToken(first.accessToken), undefined);
  assert.equal(sessions.refresh(first.refreshToken), undefined);

  users.upsertFromFeishu({ openId: 'ou_bob', name: 'Bob' });
  const second = sessions.createSession('ou_bob', 'web');
  assert.ok(sessions.verifyAccessToken(second.accessToken));
  users.markLeft('ou_alice', 'ou_bob');
  assert.equal(sessions.verifyAccessToken(second.accessToken), undefined);
  db.close();
});

test('refresh rotates the refresh token and the old one stops working', async () => {
  const { db, sessions, clock } = await setup();
  const issued = sessions.createSession('ou_alice', 'installer', 'dev-1');
  clock.advance(20 * 60_000);
  assert.equal(sessions.verifyAccessToken(issued.accessToken), undefined);

  const next = sessions.refresh(issued.refreshToken);
  assert.ok(next);
  assert.equal(next.sessionId, issued.sessionId);
  assert.notEqual(next.refreshToken, issued.refreshToken);
  assert.ok(sessions.verifyAccessToken(next.accessToken));
  assert.equal(sessions.refresh(issued.refreshToken), undefined);
  db.close();
});

test('refresh fails after the refresh lifetime', async () => {
  const { db, sessions, clock } = await setup();
  const issued = sessions.createSession('ou_alice', 'web');
  clock.advance(30 * 24 * 3600_000 + 1);
  assert.equal(sessions.refresh(issued.refreshToken), undefined);
  db.close();
});

test('revokeByRefreshToken signs the session out and reports whether anything matched', async () => {
  const { db, sessions } = await setup();
  const issued = sessions.createSession('ou_alice', 'web');
  assert.equal(sessions.revokeByRefreshToken(issued.refreshToken), true);
  assert.equal(sessions.revokeByRefreshToken(issued.refreshToken), false);
  assert.equal(sessions.verifyAccessToken(issued.accessToken), undefined);
  db.close();
});
