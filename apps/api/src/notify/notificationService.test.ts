import assert from 'node:assert/strict';
import test from 'node:test';
import { UserRepository } from '../identity/userRepository.js';
import { memoryDb } from '../testSupport/submissions.js';
import { BotSendError, MockFeishuBot, RealFeishuBot, buildCard } from './feishuBot.js';
import { NotificationService } from './notificationService.js';

async function setup(options: { retryDelaysMs?: number[] } = {}) {
  const db = await memoryDb();
  const users = new UserRepository(db);
  const bot = new MockFeishuBot();
  let clock = Date.parse('2026-10-24T00:00:00.000Z');
  const service = new NotificationService(db, bot, { publicBaseUrl: 'http://hub.test/', now: () => new Date(clock), retryDelaysMs: options.retryDelaysMs });
  const add = (openId: string, name: string, email: string, roles: Array<'reviewer' | 'admin'> = []) => {
    users.upsertFromFeishu({ openId, name, email });
    if (roles.length) users.setRoles('test', openId, roles);
  };
  add('ou_admin', 'Admin A', 'admin.a@example.com', ['admin']);
  add('ou_rev', 'Reviewer R', 'rev.r@example.com', ['reviewer']);
  add('ou_alice', 'Alice', 'alice@example.com');
  add('ou_bob', 'Bob', 'bob@example.com');
  return { db, users, bot, service, advance: (ms: number) => { clock += ms; } };
}

const submission = { id: 's1', slug: 'demo-tool', submitter: 'alice' };

test('a pending submission notifies reviewers and admins once', async () => {
  const { service, bot } = await setup();
  service.submissionPending(submission);
  service.submissionPending(submission);
  const result = await service.flush();
  assert.equal(result.sent, 2);
  assert.deepEqual(bot.sent.map((item) => item.openId).sort(), ['ou_admin', 'ou_rev']);
  assert.equal(bot.sent[0].message.link?.url, 'http://hub.test/#admin');
});

test('review results go to the submitter resolved by email local part, and ambiguous names are skipped', async () => {
  const { service, bot, users } = await setup();
  service.reviewed(submission, { id: 'r1', reviewer: 'Reviewer R', decision: 'rejected', comment: 'needs work' });
  await service.flush();
  assert.equal(bot.sent.length, 1);
  assert.equal(bot.sent[0].openId, 'ou_alice');
  assert.equal(bot.sent[0].message.color, 'red');
  assert.match(bot.sent[0].message.lines.join('\n'), /needs work/);

  users.upsertFromFeishu({ openId: 'ou_alice2', name: 'Alice', email: 'alice.two@example.com' });
  service.reviewed({ ...submission, submitter: 'Alice' }, { id: 'r2', reviewer: 'R', decision: 'approved' });
  await service.flush();
  assert.equal(bot.sent.length, 1);
});

test('tool listed reaches opted-in active members except the submitter', async () => {
  const { service, bot, db } = await setup();
  db.prepare('UPDATE users SET notify_listed = 0 WHERE open_id = ?').run('ou_bob');
  service.toolListed(submission);
  await service.flush();
  assert.deepEqual(bot.sent.map((item) => item.openId).sort(), ['ou_admin', 'ou_rev']);
});

test('users who left never receive notifications', async () => {
  const { service, bot, users } = await setup();
  users.markLeft('test', 'ou_rev');
  service.submissionPending(submission);
  await service.flush();
  assert.deepEqual(bot.sent.map((item) => item.openId), ['ou_admin']);
});

test('retryable failures back off and then give up; permanent failures stop immediately', async () => {
  const { service, bot, db, advance } = await setup({ retryDelaysMs: [1000, 2000] });
  bot.failWith = new BotSendError('down', true);
  service.enqueue('t', 'ou_alice', 'k1', { title: 't', color: 'blue', lines: ['x'] });
  assert.deepEqual(await service.flush(), { sent: 0, retrying: 1, failed: 0 });
  assert.deepEqual(await service.flush(), { sent: 0, retrying: 0, failed: 0 });
  advance(1000);
  assert.deepEqual(await service.flush(), { sent: 0, retrying: 1, failed: 0 });
  advance(2000);
  assert.deepEqual(await service.flush(), { sent: 0, retrying: 0, failed: 1 });
  assert.equal(db.prepare("SELECT status FROM notifications WHERE dedupe_key = 'k1'").get()?.status, 'failed');

  bot.failWith = new BotSendError('no permission', false);
  service.enqueue('t', 'ou_bob', 'k2', { title: 't', color: 'blue', lines: ['x'] });
  assert.deepEqual(await service.flush(), { sent: 0, retrying: 0, failed: 1 });

  bot.failWith = undefined;
  service.enqueue('t', 'ou_bob', 'k3', { title: 't', color: 'blue', lines: ['x'] });
  assert.equal((await service.flush()).sent, 1);
  assert.deepEqual(service.summary(), { failed: 2, sent: 1 });
});

test('the Feishu bot fetches a tenant token, posts an interactive card and classifies errors', async () => {
  const calls: Array<{ url: string; body: any; auth?: string }> = [];
  let sendCode = 0;
  const fetchStub = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)), auth: (init.headers as Record<string, string>).Authorization });
    if (url.includes('tenant_access_token')) {
      return Response.json({ code: 0, tenant_access_token: 'tok', expire: 7200 });
    }
    return Response.json({ code: sendCode, msg: 'm' });
  }) as unknown as typeof fetch;
  const bot = new RealFeishuBot({ appId: 'cli_x', appSecret: 'secret', fetch: fetchStub });
  const message = { title: 'Hi', color: 'blue' as const, lines: ['a', 'b'], link: { text: 'Open', url: 'http://hub.test/' } };

  await bot.send('ou_1', message, 'uuid-1');
  await bot.send('ou_2', message, 'uuid-2');
  assert.equal(calls.filter((call) => call.url.includes('tenant_access_token')).length, 1);
  const send = calls.find((call) => call.url.includes('im/v1/messages'))!;
  assert.match(send.url, /receive_id_type=open_id/);
  assert.equal(send.auth, 'Bearer tok');
  assert.equal(send.body.receive_id, 'ou_1');
  assert.equal(send.body.msg_type, 'interactive');
  assert.deepEqual(JSON.parse(send.body.content), buildCard(message));

  sendCode = 230013;
  await assert.rejects(() => bot.send('ou_3', message, 'u3'), (error: BotSendError) => error instanceof BotSendError && error.retryable === false);
  sendCode = 99991400;
  await assert.rejects(() => bot.send('ou_3', message, 'u4'), (error: BotSendError) => error.retryable === true);
});
