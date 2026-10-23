import assert from 'node:assert/strict';
import test from 'node:test';
import type { FeishuIdentity } from '../auth/feishuProvider.js';
import { loadMigrations, migrate } from '../database/migrate.js';
import { openSqlite, type SqliteDatabase } from '../database/sqlite.js';
import { EmailConflictError, LastAdminError, UserDisabledError, UserRepository } from './userRepository.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'db', 'sqlite-migrations');

async function setup(bootstrapAdminEmails: string[] = []) {
  const db = openSqlite(':memory:');
  migrate(db, await loadMigrations(migrationsDir));
  let tick = 0;
  const repo = new UserRepository(db, { bootstrapAdminEmails, now: () => new Date(Date.UTC(2026, 9, 23, 0, 0, tick++)) });
  return { db, repo };
}

const alice: FeishuIdentity = { openId: 'ou_alice', unionId: 'on_alice', name: 'Alice', email: 'alice@example.com', department: 'Scene C' };

function auditActions(db: SqliteDatabase) {
  return db.prepare('SELECT actor, action, entity_id FROM audit_log ORDER BY id').all().map((r) => ({ ...r }));
}

test('first login creates an active member and repeated logins update the profile in place', async () => {
  const { db, repo } = await setup();
  const first = repo.upsertFromFeishu(alice);
  assert.equal(first.status, 'active');
  assert.deepEqual(first.roles, []);
  assert.equal(first.department, 'Scene C');

  const second = repo.upsertFromFeishu({ ...alice, name: 'Alice Chen', department: 'Scene B' });
  assert.equal(second.name, 'Alice Chen');
  assert.equal(second.department, 'Scene B');
  assert.equal(second.createdAt, first.createdAt);
  assert.notEqual(second.lastLoginAt, first.lastLoginAt);
  assert.equal(repo.list().length, 1);
  db.close();
});

test('bootstrap admin emails are matched case-insensitively and granted admin once, with an audit entry', async () => {
  const { db, repo } = await setup(['ALICE@example.com']);
  assert.deepEqual(repo.upsertFromFeishu(alice).roles, ['admin']);
  assert.deepEqual(repo.upsertFromFeishu(alice).roles, ['admin']);
  assert.deepEqual(auditActions(db), [{ actor: 'bootstrap', action: 'role.grant', entity_id: 'ou_alice' }]);

  assert.deepEqual(repo.upsertFromFeishu({ openId: 'ou_bob', name: 'Bob', email: 'bob@example.com' }).roles, []);
  db.close();
});

test('a second person with the same email is rejected instead of being merged', async () => {
  const { db, repo } = await setup();
  repo.upsertFromFeishu(alice);
  assert.throws(() => repo.upsertFromFeishu({ openId: 'ou_other', name: 'Other', email: 'Alice@Example.com' }), EmailConflictError);
  db.close();
});

test('users marked as left cannot sign in again but keep their record', async () => {
  const { db, repo } = await setup(['alice@example.com']);
  repo.upsertFromFeishu(alice);
  repo.upsertFromFeishu({ openId: 'ou_bob', name: 'Bob', email: 'bob@example.com' });
  repo.markLeft('ou_alice', 'ou_bob');
  assert.equal(repo.get('ou_bob')?.status, 'left');
  assert.throws(() => repo.upsertFromFeishu({ openId: 'ou_bob', name: 'Bob' }), UserDisabledError);
  db.close();
});

test('setRoles replaces roles, records before and after, and never removes the last admin', async () => {
  const { db, repo } = await setup(['alice@example.com']);
  repo.upsertFromFeishu(alice);
  repo.upsertFromFeishu({ openId: 'ou_bob', name: 'Bob', email: 'bob@example.com' });

  const bob = repo.setRoles('ou_alice', 'ou_bob', ['reviewer']);
  assert.deepEqual(bob.roles, ['reviewer']);
  const audit = db.prepare("SELECT before, after FROM audit_log WHERE action = 'role.set' AND entity_id = 'ou_bob'").get();
  assert.deepEqual([audit?.before, audit?.after], ['[]', '["reviewer"]']);

  assert.throws(() => repo.setRoles('ou_alice', 'ou_alice', []), LastAdminError);
  repo.setRoles('ou_alice', 'ou_bob', ['admin']);
  assert.deepEqual(repo.setRoles('ou_bob', 'ou_alice', []).roles, []);
  db.close();
});

test('unknown users cannot be given roles', async () => {
  const { db, repo } = await setup();
  assert.throws(() => repo.setRoles('ou_alice', 'ou_missing', ['admin']), /not found/i);
  db.close();
});
