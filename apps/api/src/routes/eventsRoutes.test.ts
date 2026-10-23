import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../app/createApp.js';
import type { ApiConfig } from '../config/env.js';
import { openSqlite } from '../database/sqlite.js';

type App = Awaited<ReturnType<typeof createApp>>;

async function withApp(overrides: Partial<ApiConfig>, run: (ctx: { app: App; config: ApiConfig; rows: (sql: string, ...params: string[]) => Array<Record<string, unknown>> }) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tapython-events-'));
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
    eventsEnabled: true,
    feishuAuthEnabled: true,
    feishuProvider: 'mock',
    ...overrides
  };
  const app = await createApp(config);
  const rows = (sql: string, ...params: string[]) => {
    const db = openSqlite(config.sqlitePath!);
    try {
      return db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    } finally {
      db.close();
    }
  };
  try {
    await run({ app, config, rows });
  } finally {
    await app.close();
    await fs.rm(root, { recursive: true, force: true });
  }
}

const event = (id: string, extra: Record<string, unknown> = {}) => ({ eventId: id, type: 'tool.install', slug: 'actor-rename-tool', version: '1.2.0', at: new Date().toISOString(), ...extra });
const batch = (events: unknown[], extra: Record<string, unknown> = {}) => ({ deviceId: 'device-1', client: 'installer', clientVersion: '1.17.0', ueVersion: '5.5', events, ...extra });

async function login(app: App, email: string, deviceId?: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/feishu/exchange',
    payload: { code: `mock:${email}`, redirectUri: 'http://127.0.0.1:53682/callback', codeVerifier: 'v'.repeat(48), client: 'installer', deviceId }
  });
  assert.equal(response.statusCode, 200);
  return response.json();
}

test('events stay off unless enabled', async () => {
  await withApp({ eventsEnabled: false }, async ({ app }) => {
    assert.deepEqual((await app.inject({ url: '/api/v1/features' })).json(), { auth: true, events: false });
    assert.deepEqual((await app.inject({ url: '/health' })).json().features, { auth: true, events: false });
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/events', payload: batch([event('e1')]) })).statusCode, 404);
  });
  await assert.rejects(() => withApp({ sqlitePath: undefined, feishuAuthEnabled: false }, async () => {}), /SQLITE_PATH/);
});

test('anonymous batches are stored once even when resent', async () => {
  await withApp({}, async ({ app, rows }) => {
    const first = await app.inject({ method: 'POST', url: '/api/v1/events', payload: batch([event('e1'), event('e2', { type: 'app.launch', slug: undefined, version: undefined })]) });
    assert.equal(first.statusCode, 202);
    assert.deepEqual(first.json(), { accepted: 2, duplicates: 0 });

    const resend = await app.inject({ method: 'POST', url: '/api/v1/events', payload: batch([event('e1'), event('e3')]) });
    assert.deepEqual(resend.json(), { accepted: 1, duplicates: 1 });

    const stored = rows('SELECT event_id, open_id, device_id, source, client_version, ue_version FROM events ORDER BY event_id');
    assert.equal(stored.length, 3);
    assert.equal(stored[0].open_id, null);
    assert.equal(stored[0].source, 'client');
    assert.equal(stored[0].ue_version, '5.5');
    assert.equal(rows('SELECT device_id FROM devices').length, 1);
  });
});

test('malformed batches are rejected without storing anything', async () => {
  await withApp({}, async ({ app, rows }) => {
    const post = (payload: unknown) => app.inject({ method: 'POST', url: '/api/v1/events', payload: payload as object });
    assert.equal((await post(batch([]))).json().error, 'invalid_events');
    assert.equal((await post(batch(Array.from({ length: 51 }, (_, i) => event(`e${i}`))))).json().error, 'invalid_events');
    assert.equal((await post(batch([event('e1', { type: 'tool.hack' })]))).json().error, 'invalid_event_type');
    assert.equal((await post(batch([event('e1', { slug: undefined })]))).json().error, 'invalid_event_target');
    assert.equal((await post(batch([event('e1', { slug: '../etc' })]))).json().error, 'invalid_event_target');
    assert.equal((await post(batch([event('e1', { meta: { big: 'x'.repeat(3000) } })]))).json().error, 'invalid_event_meta');
    assert.equal((await post(batch([event('bad id')]))).json().error, 'invalid_event_id');
    assert.equal((await post(batch([event('e1')], { deviceId: 'bad device' }))).json().error, 'invalid_device_id');
    assert.equal((await post(batch([event('e1')], { client: 'toaster' }))).json().error, 'invalid_client');
    assert.equal(rows('SELECT 1 FROM events').length, 0);
  });
});

test('a valid bearer token attributes the batch and an invalid one stays anonymous', async () => {
  await withApp({}, async ({ app, rows }) => {
    const session = await login(app, 'member@example.com');
    await app.inject({ method: 'POST', url: '/api/v1/events', headers: { authorization: `Bearer ${session.accessToken}` }, payload: batch([event('mine')]) });
    await app.inject({ method: 'POST', url: '/api/v1/events', headers: { authorization: 'Bearer garbage' }, payload: batch([event('anon')]) });
    const stored = Object.fromEntries(rows('SELECT event_id, open_id FROM events').map((r) => [r.event_id, r.open_id]));
    assert.equal(stored.mine, session.user.openId);
    assert.equal(stored.anon, null);
  });
});

test('signing in from a device claims its earlier anonymous history only', async () => {
  await withApp({}, async ({ app, rows }) => {
    await app.inject({ method: 'POST', url: '/api/v1/events', payload: batch([event('before')], { deviceId: 'device-1' }) });
    await app.inject({ method: 'POST', url: '/api/v1/events', payload: batch([event('other')], { deviceId: 'device-2' }) });
    const session = await login(app, 'member@example.com', 'device-1');

    const owners = Object.fromEntries(rows('SELECT event_id, open_id FROM events').map((r) => [r.event_id, r.open_id]));
    assert.equal(owners.before, session.user.openId);
    assert.equal(owners.other, null);
    assert.equal(rows('SELECT open_id FROM devices WHERE device_id = ?', 'device-1')[0].open_id, session.user.openId);
  });
});

test('implausible client timestamps fall back to server time', async () => {
  await withApp({}, async ({ app, rows }) => {
    await app.inject({ method: 'POST', url: '/api/v1/events', payload: batch([event('old', { at: '2001-01-01T00:00:00Z' }), event('future', { at: '2999-01-01T00:00:00Z' }), event('junk', { at: 'yesterday' })]) });
    for (const row of rows('SELECT at FROM events')) {
      assert.ok(Math.abs(Date.parse(String(row.at)) - Date.now()) < 60_000);
    }
  });
});

test('server counts manifest and package downloads without affecting the response', async () => {
  await withApp({}, async ({ app, config, rows }) => {
    const dir = path.join(config.downloadRoot, 'demo-tool', '1.0.0');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'manifest.json'), '{}', 'utf8');
    await fs.writeFile(path.join(dir, 'demo-tool-1.0.0.zip'), 'zip-bytes');
    await fs.writeFile(path.join(dir, 'README.md'), '# readme', 'utf8');

    assert.equal((await app.inject({ url: '/downloads/demo-tool/1.0.0/manifest.json', headers: { 'x-tapython-device': 'device-9' } })).statusCode, 200);
    const zip = await app.inject({ url: '/downloads/demo-tool/1.0.0/demo-tool-1.0.0.zip' });
    assert.equal(zip.body, 'zip-bytes');
    await app.inject({ url: '/downloads/demo-tool/1.0.0/README.md' });
    assert.equal((await app.inject({ url: '/downloads/demo-tool/1.0.0/missing.zip' })).statusCode, 404);

    const counted = rows("SELECT type, slug, version, device_id, source FROM events ORDER BY type");
    assert.deepEqual(counted.map((r) => r.type), ['download.manifest', 'download.package']);
    assert.equal(counted[0].device_id, 'device-9');
    assert.equal(counted[0].slug, 'demo-tool');
    assert.equal(counted[0].source, 'server');
  });
});
