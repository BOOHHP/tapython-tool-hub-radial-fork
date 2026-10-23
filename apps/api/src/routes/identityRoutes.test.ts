import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../app/createApp.js';
import type { ApiConfig } from '../config/env.js';
import { openSqlite } from '../database/sqlite.js';
import { createPasswordHash } from '../services/authService.js';

const verifier = 'v'.repeat(48);
const loopbackRedirect = 'http://127.0.0.1:53682/callback';

async function withApp(overrides: Partial<ApiConfig>, run: (ctx: { app: Awaited<ReturnType<typeof createApp>>; config: ApiConfig }) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tapython-identity-'));
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
    adminUsername: 'admin',
    adminPasswordHash: createPasswordHash('correct-password', 'test-salt', 210000),
    authSessionSecret: 'test-session-secret-with-enough-length',
    adminSessionTtlHours: 12,
    sqlitePath: path.join(root, 'hub.sqlite'),
    feishuAuthEnabled: true,
    feishuProvider: 'mock',
    bootstrapAdminEmails: ['dev@example.com'],
    ...overrides
  };
  const app = await createApp(config);
  try {
    await run({ app, config });
  } finally {
    await app.close();
    await fs.rm(root, { recursive: true, force: true });
  }
}

type App = Awaited<ReturnType<typeof createApp>>;

async function exchange(app: App, email: string, extra: Record<string, unknown> = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/auth/feishu/exchange',
    payload: { code: `mock:${email}`, redirectUri: loopbackRedirect, codeVerifier: verifier, client: 'installer', deviceId: 'dev-1', ...extra }
  });
}

async function bearerFor(app: App, email: string) {
  const response = await exchange(app, email);
  assert.equal(response.statusCode, 200);
  return { authorization: `Bearer ${response.json().accessToken}` };
}

function cookieHeader(setCookie: string | string[] | undefined): string {
  return [setCookie ?? []].flat().map((entry) => entry.split(';')[0]).filter((pair) => !pair.endsWith('=')).join('; ');
}

test('feishu login is off by default', async () => {
  await withApp({ feishuAuthEnabled: false, sqlitePath: undefined }, async ({ app }) => {
    assert.deepEqual((await app.inject({ url: '/api/v1/auth/config' })).json(), { enabled: false });
    assert.equal((await app.inject({ url: '/api/v1/auth/me' })).statusCode, 404);
  });
});

test('enabling feishu login without sqlite or a provider fails fast', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tapython-identity-'));
  try {
    await assert.rejects(() => withApp({ sqlitePath: undefined }, async () => {}), /SQLITE_PATH/);
    await assert.rejects(() => withApp({ feishuProvider: undefined }, async () => {}), /FEISHU_PROVIDER/);
    await assert.rejects(() => withApp({ feishuProvider: 'real', feishuAppId: 'cli_x', feishuAppSecret: 's' }, async () => {}), /PUBLIC_BASE_URL/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('web login completes through the callback, sets cookies and bootstraps the configured admin', async () => {
  await withApp({}, async ({ app }) => {
    const login = await app.inject({ url: '/api/v1/auth/feishu/login?returnTo=/admin' });
    assert.equal(login.statusCode, 302);
    const stateCookie = cookieHeader(login.headers['set-cookie']);
    const location = new URL(String(login.headers.location));
    assert.equal(location.pathname, '/api/v1/auth/feishu/callback');

    const callback = await app.inject({ url: `${location.pathname}${location.search}`, headers: { cookie: stateCookie } });
    assert.equal(callback.statusCode, 302);
    assert.equal(callback.headers.location, '/admin');
    const setCookies = [callback.headers['set-cookie']].flat().join('\n');
    assert.match(setCookies, /tapython_hub_access=.*HttpOnly.*SameSite=Lax/);
    assert.match(setCookies, /tapython_hub_refresh=.*Path=\/api\/v1\/auth/);

    const me = await app.inject({ url: '/api/v1/auth/me', headers: { cookie: cookieHeader(callback.headers['set-cookie']) } });
    assert.equal(me.statusCode, 200);
    assert.deepEqual(me.json().user.roles, ['admin']);
    assert.equal(me.json().user.email, 'dev@example.com');
  });
});

test('web login rejects a mismatched state and never redirects off-site', async () => {
  await withApp({}, async ({ app }) => {
    const login = await app.inject({ url: '/api/v1/auth/feishu/login?returnTo=//evil.example' });
    const stateCookie = cookieHeader(login.headers['set-cookie']);
    const location = new URL(String(login.headers.location));

    const forged = await app.inject({ url: `${location.pathname}?code=mock:dev@example.com&state=forged`, headers: { cookie: stateCookie } });
    assert.equal(forged.headers.location, '/?login_error=invalid_state');
    assert.equal(cookieHeader(forged.headers['set-cookie']).includes('tapython_hub_access'), false);

    const ok = await app.inject({ url: `${location.pathname}${location.search}`, headers: { cookie: stateCookie } });
    assert.equal(ok.headers.location, '/');

    const noCookie = await app.inject({ url: `${location.pathname}${location.search}` });
    assert.equal(noCookie.headers.location, '/?login_error=invalid_state');
  });
});

test('installer code exchange issues bearer tokens and enforces its input rules', async () => {
  await withApp({}, async ({ app }) => {
    const ok = await exchange(app, 'member@example.com');
    assert.equal(ok.statusCode, 200);
    assert.deepEqual(ok.json().user.roles, []);

    const me = await app.inject({ url: '/api/v1/auth/me', headers: { authorization: `Bearer ${ok.json().accessToken}` } });
    assert.equal(me.json().user.email, 'member@example.com');

    assert.equal((await exchange(app, 'x@example.com', { redirectUri: 'https://evil.example/cb' })).json().error, 'invalid_redirect_uri');
    assert.equal((await exchange(app, 'x@example.com', { redirectUri: 'http://127.0.0.1.evil.example/cb' })).statusCode, 400);
    assert.equal((await exchange(app, 'x@example.com', { codeVerifier: 'short' })).json().error, 'invalid_code_verifier');
    assert.equal((await exchange(app, 'x@example.com', { client: 'web' })).statusCode, 400);
    const badCode = await exchange(app, 'x@example.com', { code: 'garbage' });
    assert.equal(badCode.statusCode, 400);
    assert.equal(badCode.json().error, 'invalid_code');
  });
});

test('refresh rotates the refresh token and logout revokes the session', async () => {
  await withApp({}, async ({ app }) => {
    const first = (await exchange(app, 'member@example.com')).json();
    const refreshed = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken: first.refreshToken } });
    assert.equal(refreshed.statusCode, 200);
    assert.notEqual(refreshed.json().refreshToken, first.refreshToken);

    const reused = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken: first.refreshToken } });
    assert.equal(reused.statusCode, 401);

    const auth = { authorization: `Bearer ${refreshed.json().accessToken}` };
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: auth, payload: { refreshToken: refreshed.json().refreshToken } })).statusCode, 200);
    assert.equal((await app.inject({ url: '/api/v1/auth/me', headers: auth })).statusCode, 401);
  });
});

test('cross-origin cookie refresh and logout are rejected', async () => {
  await withApp({}, async ({ app }) => {
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { origin: 'https://evil.example', host: '127.0.0.1:8787' } });
    assert.equal(response.statusCode, 403);
  });
});

test('role based access: member, reviewer, admin and the emergency admin', async () => {
  await withApp({}, async ({ app, config }) => {
    const member = await bearerFor(app, 'member@example.com');
    const reviewer = await bearerFor(app, 'reviewer@example.com');
    const admin = await bearerFor(app, 'dev@example.com');

    assert.equal((await app.inject({ url: '/api/admin/submissions' })).statusCode, 401);
    assert.equal((await app.inject({ url: '/api/admin/submissions', headers: member })).statusCode, 403);
    assert.equal((await app.inject({ url: '/api/admin/users', headers: member })).statusCode, 403);

    const users = (await app.inject({ url: '/api/admin/users', headers: admin })).json();
    assert.equal(users.total, 3);
    const reviewerId = users.users.find((u: { email: string }) => u.email === 'reviewer@example.com').openId;
    const memberId = users.users.find((u: { email: string }) => u.email === 'member@example.com').openId;

    const grant = await app.inject({ method: 'PUT', url: `/api/admin/users/${reviewerId}/roles`, headers: admin, payload: { roles: ['reviewer'] } });
    assert.deepEqual(grant.json().roles, ['reviewer']);
    assert.equal((await app.inject({ method: 'PUT', url: `/api/admin/users/${reviewerId}/roles`, headers: admin, payload: { roles: ['superuser'] } })).statusCode, 400);
    assert.equal((await app.inject({ method: 'PUT', url: '/api/admin/users/nobody/roles', headers: admin, payload: { roles: [] } })).statusCode, 404);

    // Roles are read on every request, so the previously issued reviewer token now carries the role.
    assert.equal((await app.inject({ url: '/api/admin/submissions', headers: reviewer })).statusCode, 200);
    assert.equal((await app.inject({ method: 'DELETE', url: '/api/admin/submissions/x', headers: reviewer })).statusCode, 403);
    assert.equal((await app.inject({ method: 'DELETE', url: '/api/admin/submissions/x', headers: admin })).statusCode, 404);
    assert.equal((await app.inject({ url: '/api/admin/users', headers: reviewer })).statusCode, 403);

    const lastAdmin = await app.inject({ method: 'PUT', url: `/api/admin/users/${users.users.find((u: { roles: string[] }) => u.roles.includes('admin')).openId}/roles`, headers: admin, payload: { roles: [] } });
    assert.equal(lastAdmin.statusCode, 409);

    const left = await app.inject({ method: 'POST', url: `/api/admin/users/${memberId}/left`, headers: admin });
    assert.equal(left.json().status, 'left');
    assert.equal((await app.inject({ url: '/api/v1/auth/me', headers: member })).statusCode, 401);
    const relogin = await exchange(app, 'member@example.com');
    assert.equal(relogin.statusCode, 403);
    assert.equal(relogin.json().error, 'account_disabled');

    const emergency = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'correct-password' } });
    const emergencyCookie = `${emergency.cookies[0].name}=${emergency.cookies[0].value}`;
    assert.equal((await app.inject({ url: '/api/admin/users', headers: { cookie: emergencyCookie } })).statusCode, 200);

    const db = openSqlite(config.sqlitePath!);
    try {
      const actions = db.prepare('SELECT action, actor FROM audit_log ORDER BY id').all().map((row) => `${row.action}`);
      assert.ok(actions.includes('role.set'));
      assert.ok(actions.includes('user.left'));
    } finally {
      db.close();
    }
  });
});

test('admin sets a team override and binds author aliases to people or teams', async () => {
  await withApp({}, async ({ app, config }) => {
    const admin = await bearerFor(app, 'dev@example.com');
    const member = await bearerFor(app, 'member@example.com');
    const users = (await app.inject({ url: '/api/admin/users', headers: admin })).json().users as Array<{ openId: string; email: string }>;
    const memberId = users.find((u) => u.email === 'member@example.com')!.openId;

    const db = openSqlite(config.sqlitePath!);
    try {
      db.prepare("INSERT INTO tools (slug, name, display_name, author, synced_at) VALUES ('t1', 'T1', 'T1', 'WuJunFeng', 'now')").run();
      db.prepare("INSERT INTO submissions (id, slug, submitter, status, record, created_at, updated_at) VALUES ('a-1', 't1', 'junfeng', 'approved', '{}', 'now', 'now')").run();
    } finally {
      db.close();
    }

    assert.equal((await app.inject({ method: 'PUT', url: `/api/admin/users/${memberId}/team`, headers: member, payload: { team: 'X' } })).statusCode, 403);
    const team = await app.inject({ method: 'PUT', url: `/api/admin/users/${memberId}/team`, headers: admin, payload: { team: '  Scene B  ' } });
    assert.equal(team.json().team, 'Scene B');
    assert.equal((await app.inject({ method: 'PUT', url: `/api/admin/users/${memberId}/team`, headers: admin, payload: { team: null } })).json().team, undefined);
    assert.equal((await app.inject({ method: 'PUT', url: `/api/admin/users/${memberId}/team`, headers: admin, payload: { team: 5 } })).statusCode, 400);

    const before = (await app.inject({ url: '/api/admin/author-aliases', headers: admin })).json();
    assert.deepEqual(before.candidates.map((c: { name: string }) => c.name).sort(), ['WuJunFeng', 'junfeng']);

    const bound = await app.inject({ method: 'PUT', url: '/api/admin/author-aliases', headers: admin, payload: { alias: 'junfeng', kind: 'person', openId: memberId } });
    assert.equal(bound.json().userName, 'member');
    assert.equal((await app.inject({ method: 'PUT', url: '/api/admin/author-aliases', headers: admin, payload: { alias: 'WuJunFeng', kind: 'person' } })).statusCode, 400);
    assert.equal((await app.inject({ method: 'PUT', url: '/api/admin/author-aliases', headers: admin, payload: { alias: 'Scene B', kind: 'team' } })).statusCode, 200);

    const after = (await app.inject({ url: '/api/admin/author-aliases', headers: admin })).json();
    assert.equal(after.candidates.find((c: { name: string }) => c.name === 'junfeng').openId, memberId);
    assert.equal((await app.inject({ method: 'DELETE', url: '/api/admin/author-aliases?alias=junfeng', headers: admin })).statusCode, 204);
    assert.equal((await app.inject({ method: 'DELETE', url: '/api/admin/author-aliases?alias=junfeng', headers: admin })).statusCode, 404);
    assert.equal((await app.inject({ url: '/api/admin/author-aliases', headers: member })).statusCode, 403);
  });
});