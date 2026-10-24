import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../app/createApp.js';
import type { ApiConfig } from '../config/env.js';
import { BotSendError, MockFeishuBot } from '../notify/feishuBot.js';

const verifier = 'v'.repeat(48);

async function withApp(run: (ctx: { app: Awaited<ReturnType<typeof createApp>>; bot: MockFeishuBot; as: (email: string) => Promise<{ headers: Record<string, string>; openId: string }> }) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tapython-feedback-'));
  const config: ApiConfig = {
    host: '127.0.0.1',
    port: 8787,
    repoRoot: root,
    toolDataRoot: path.join(root, 'data', 'tools'),
    toolDocsRoot: path.join(root, 'data', 'tool-docs'),
    toolApiRoot: path.join(root, 'public', 'api', 'tools'),
    downloadRoot: path.join(root, 'public', 'downloads'),
    submissionRoot: path.join(root, 'submissions'),
    serveStatic: false,
    webStaticRoot: path.join(root, 'dist'),
    authSessionSecret: 'test-session-secret-with-enough-length',
    sqlitePath: path.join(root, 'hub.sqlite'),
    feishuAuthEnabled: true,
    feishuProvider: 'mock',
    bootstrapAdminEmails: ['admin@example.com'],
    notifyEnabled: true,
    publicBaseUrl: 'http://hub.test'
  };
  const bot = new MockFeishuBot();
  const app = await createApp(config, { bot });
  const as = async (email: string) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/feishu/exchange',
      payload: { code: `mock:${email}`, redirectUri: 'http://127.0.0.1:53682/callback', codeVerifier: verifier, client: 'installer', deviceId: 'dev-1' }
    });
    assert.equal(response.statusCode, 200);
    return { headers: { authorization: `Bearer ${response.json().accessToken}` }, openId: response.json().user.openId as string };
  };
  try {
    await run({ app, bot, as });
  } finally {
    await app.close();
    await fs.rm(root, { recursive: true, force: true });
  }
}

const valid = { kind: 'bug', title: 'Crash on install', body: 'Steps: 1, 2, 3', client: 'installer', clientVersion: '1.17.1', ueVersion: '5.4' };

test('feedback needs sign-in and validates input', async () => {
  await withApp(async ({ app, as }) => {
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/feedback', payload: valid })).statusCode, 401);
    const member = await as('member@example.com');
    for (const bad of [{ ...valid, kind: 'rant' }, { ...valid, title: '  ' }, { ...valid, body: 'x'.repeat(4001) }, { ...valid, slug: 'Bad Slug' }, { ...valid, client: 'fax' }]) {
      assert.equal((await app.inject({ method: 'POST', url: '/api/v1/feedback', headers: member.headers, payload: bad })).statusCode, 400);
    }
    const crossSite = await app.inject({ method: 'POST', url: '/api/v1/feedback', headers: { ...member.headers, origin: 'http://evil.test', host: 'hub.test' }, payload: valid });
    assert.equal(crossSite.statusCode, 403);
  });
});

test('feedback lifecycle: submit, notify admins, staff reply and status change reach the author', async () => {
  await withApp(async ({ app, bot, as }) => {
    const admin = await as('admin@example.com');
    const reviewer = await as('reviewer@example.com');
    const member = await as('member@example.com');
    const other = await as('other@example.com');
    assert.equal((await app.inject({ method: 'PUT', url: `/api/admin/users/${reviewer.openId}/roles`, headers: admin.headers, payload: { roles: ['reviewer'] } })).statusCode, 200);

    const created = await app.inject({ method: 'POST', url: '/api/v1/feedback', headers: member.headers, payload: valid });
    assert.equal(created.statusCode, 201);
    const id = created.json().id as string;
    await app.notifications!.flush();
    assert.deepEqual(bot.sent.map((item) => item.openId), [admin.openId]);
    assert.match(bot.sent[0].message.title, /问题反馈/);
    bot.sent.length = 0;

    assert.equal((await app.inject({ url: `/api/v1/feedback/${id}`, headers: other.headers })).statusCode, 404);
    assert.equal((await app.inject({ url: `/api/v1/feedback/${id}`, headers: member.headers })).statusCode, 200);
    assert.equal((await app.inject({ url: '/api/v1/me/feedback', headers: member.headers })).json().feedback.length, 1);
    assert.equal((await app.inject({ url: '/api/v1/me/feedback', headers: other.headers })).json().feedback.length, 0);
    assert.equal((await app.inject({ url: '/api/v1/admin/feedback', headers: member.headers })).statusCode, 403);

    const list = await app.inject({ url: '/api/v1/admin/feedback?status=open', headers: reviewer.headers });
    assert.equal(list.json().feedback.length, 1);
    assert.equal((await app.inject({ url: '/api/v1/admin/feedback?status=bogus', headers: reviewer.headers })).statusCode, 400);

    const reply = await app.inject({ method: 'POST', url: `/api/v1/feedback/${id}/replies`, headers: reviewer.headers, payload: { body: 'Looking into it' } });
    assert.equal(reply.statusCode, 201);
    assert.equal(reply.json().staff, true);
    const patched = await app.inject({ method: 'PATCH', url: `/api/v1/admin/feedback/${id}`, headers: reviewer.headers, payload: { status: 'resolved', assignee: reviewer.openId } });
    assert.equal(patched.statusCode, 200);
    assert.equal(patched.json().status, 'resolved');
    assert.equal(patched.json().assignee.openId, reviewer.openId);
    await app.notifications!.flush();
    assert.deepEqual(bot.sent.map((item) => `${item.openId === member.openId ? 'author' : item.openId}:${item.message.title}`).sort(), ['author:你的反馈有新回复', 'author:反馈状态更新：已解决']);

    assert.equal((await app.inject({ method: 'PATCH', url: `/api/v1/admin/feedback/${id}`, headers: reviewer.headers, payload: { assignee: member.openId } })).statusCode, 400);

    bot.sent.length = 0;
    const followUp = await app.inject({ method: 'POST', url: `/api/v1/feedback/${id}/replies`, headers: member.headers, payload: { body: 'Still broken' } });
    assert.equal(followUp.statusCode, 201);
    assert.equal(followUp.json().staff, false);
    await app.notifications!.flush();
    assert.deepEqual(bot.sent.map((item) => item.openId), [reviewer.openId]);
  });
});

test('submitting feedback is rate limited per user', async () => {
  await withApp(async ({ app, as }) => {
    const member = await as('member@example.com');
    for (let index = 0; index < 10; index += 1) {
      assert.equal((await app.inject({ method: 'POST', url: '/api/v1/feedback', headers: member.headers, payload: { ...valid, title: `t${index}` } })).statusCode, 201);
    }
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/feedback', headers: member.headers, payload: valid })).statusCode, 429);
  });
});

test('members can opt out of the tool listed broadcast', async () => {
  await withApp(async ({ app, as }) => {
    const member = await as('member@example.com');
    assert.deepEqual((await app.inject({ url: '/api/v1/me/notifications', headers: member.headers })).json(), { listed: true });
    const off = await app.inject({ method: 'PUT', url: '/api/v1/me/notifications', headers: member.headers, payload: { listed: false } });
    assert.deepEqual(off.json(), { listed: false });
    assert.equal((await app.inject({ method: 'PUT', url: '/api/v1/me/notifications', headers: member.headers, payload: { listed: 'no' } })).statusCode, 400);
  });
});

test('NOTIFY_ENABLED fails fast without identity storage or Feishu credentials', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tapython-feedback-'));
  const base: ApiConfig = {
    host: '127.0.0.1', port: 8787, repoRoot: root, toolDataRoot: path.join(root, 'a'), toolDocsRoot: path.join(root, 'b'), toolApiRoot: path.join(root, 'c'),
    downloadRoot: path.join(root, 'd'), submissionRoot: path.join(root, 'e'), serveStatic: false, webStaticRoot: path.join(root, 'f'),
    authSessionSecret: 'test-session-secret-with-enough-length', sqlitePath: path.join(root, 'hub.sqlite'), feishuAuthEnabled: true, feishuProvider: 'mock', notifyEnabled: true
  };
  try {
    await assert.rejects(() => createApp({ ...base, feishuAuthEnabled: false }), /NOTIFY_ENABLED/);
    await assert.rejects(() => createApp(base), /FEISHU_APP_ID/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('admins can send themselves a test notification and read delivery diagnostics', async () => {
  await withApp(async ({ app, bot, as }) => {
    const admin = await as('admin@example.com');
    const member = await as('member@example.com');
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/admin/notifications/test', headers: member.headers })).statusCode, 403);
    const sent = await app.inject({ method: 'POST', url: '/api/v1/admin/notifications/test', headers: admin.headers });
    assert.equal(sent.statusCode, 202);
    assert.equal(sent.json().sent, 1);
    assert.deepEqual(bot.sent.map((item) => item.openId), [admin.openId]);

    bot.failWith = new BotSendError('Feishu send failed (code 99991672: no permission)', false);
    const failed = await app.inject({ method: 'POST', url: '/api/v1/admin/notifications/test', headers: admin.headers });
    assert.equal(failed.json().failed, 1);
    const diagnostics = (await app.inject({ url: '/api/v1/admin/notifications', headers: admin.headers })).json();
    assert.deepEqual(diagnostics.counts, { sent: 1, failed: 1 });
    assert.match(diagnostics.recentFailures[0].error, /99991672/);
  });
});