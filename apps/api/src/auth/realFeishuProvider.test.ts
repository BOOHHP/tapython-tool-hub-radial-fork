import assert from 'node:assert/strict';
import test from 'node:test';
import { FeishuAuthError } from './feishuProvider.js';
import { RealFeishuProvider } from './realFeishuProvider.js';

interface Call { url: string; method: string; headers: Record<string, string>; body?: unknown }

function fakeFetch(handlers: Record<string, (call: Call) => unknown>) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const call: Call = {
      url,
      method: init?.method ?? 'GET',
      headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)),
      body: init?.body ? JSON.parse(String(init.body)) : undefined
    };
    calls.push(call);
    const key = Object.keys(handlers).find((prefix) => url.startsWith(prefix));
    if (!key) {
      throw new Error(`unexpected fetch ${url}`);
    }
    return new Response(JSON.stringify(handlers[key](call)), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { calls, impl };
}

const tokenUrl = 'https://open.feishu.cn/open-apis/authen/v2/oauth/token';
const userInfoUrl = 'https://open.feishu.cn/open-apis/authen/v1/user_info';
const redirectUri = 'http://10.2.13.8:8787/auth/feishu/callback';

function provider(handlers: Record<string, (call: Call) => unknown>, extra: Partial<ConstructorParameters<typeof RealFeishuProvider>[0]> = {}) {
  const { calls, impl } = fakeFetch(handlers);
  return { calls, provider: new RealFeishuProvider({ appId: 'cli_test', appSecret: 'SECRET-VALUE', fetch: impl, ...extra }) };
}

test('authorize url targets the Feishu authorize page with state, redirect and optional scope and PKCE challenge', () => {
  const { provider: p } = provider({}, { scope: 'contact:user.email:readonly' });
  const url = new URL(p.buildAuthorizeUrl('state-1', redirectUri, { codeChallenge: 'abc' }));
  assert.equal(`${url.origin}${url.pathname}`, 'https://accounts.feishu.cn/open-apis/authen/v1/authorize');
  assert.equal(url.searchParams.get('client_id'), 'cli_test');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('redirect_uri'), redirectUri);
  assert.equal(url.searchParams.get('state'), 'state-1');
  assert.equal(url.searchParams.get('scope'), 'contact:user.email:readonly');
  assert.equal(url.searchParams.get('code_challenge'), 'abc');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');

  const plain = new URL(provider({}).provider.buildAuthorizeUrl('s', redirectUri));
  assert.equal(plain.searchParams.has('scope'), false);
  assert.equal(plain.searchParams.has('code_challenge'), false);
});

test('exchanges the code server-side and maps the user info to an identity', async () => {
  const { provider: p, calls } = provider({
    [tokenUrl]: () => ({ code: 0, access_token: 'u-token', expires_in: 7200 }),
    [userInfoUrl]: () => ({ code: 0, data: { name: 'Alice', open_id: 'ou_a', union_id: 'on_a', email: 'alice@example.com' } })
  });

  const identity = await p.exchangeCode('the-code', redirectUri, { codeVerifier: 'verifier-1' });
  assert.deepEqual(identity, { openId: 'ou_a', unionId: 'on_a', name: 'Alice', email: 'alice@example.com', department: undefined });

  assert.equal(calls[0].method, 'POST');
  assert.deepEqual(calls[0].body, {
    grant_type: 'authorization_code', client_id: 'cli_test', client_secret: 'SECRET-VALUE', code: 'the-code', redirect_uri: redirectUri, code_verifier: 'verifier-1'
  });
  assert.equal(calls[1].headers.Authorization, 'Bearer u-token');
  assert.equal(JSON.stringify(calls[1]).includes('SECRET-VALUE'), false);
});

test('falls back to the enterprise email when the personal email is missing', async () => {
  const { provider: p } = provider({
    [tokenUrl]: () => ({ code: 0, access_token: 't' }),
    [userInfoUrl]: () => ({ code: 0, data: { name: 'Bob', open_id: 'ou_b', enterprise_email: 'bob@corp.example' } })
  });
  assert.equal((await p.exchangeCode('c', redirectUri)).email, 'bob@corp.example');
});

test('expired, reused or unknown codes surface as invalid_code', async () => {
  for (const errorCode of [20003, 20004, 20065]) {
    const { provider: p } = provider({ [tokenUrl]: () => ({ code: errorCode, error: 'x', error_description: 'bad' }) });
    await assert.rejects(() => p.exchangeCode('c', redirectUri), (e: unknown) => e instanceof FeishuAuthError && e.code === 'invalid_code');
  }
  const { provider: p } = provider({ [tokenUrl]: () => ({ code: 20050, error: 'server_error', error_description: 'retry' }) });
  await assert.rejects(() => p.exchangeCode('c', redirectUri), (e: unknown) => e instanceof FeishuAuthError && e.code === 'exchange_failed');
});

test('errors never echo the app secret or the user token', async () => {
  const { provider: p } = provider({
    [tokenUrl]: () => ({ code: 0, access_token: 'u-token-VALUE' }),
    [userInfoUrl]: () => ({ code: 20005, msg: 'invalid user_access_token u-token-VALUE' })
  });
  await assert.rejects(() => p.exchangeCode('c', redirectUri), (e: unknown) => {
    const message = (e as Error).message;
    return e instanceof FeishuAuthError && !message.includes('u-token-VALUE') && !message.includes('SECRET-VALUE');
  });
});

test('a user without open_id is rejected', async () => {
  const { provider: p } = provider({
    [tokenUrl]: () => ({ code: 0, access_token: 't' }),
    [userInfoUrl]: () => ({ code: 0, data: { name: 'Nobody' } })
  });
  await assert.rejects(() => p.exchangeCode('c', redirectUri), FeishuAuthError);
});

test('department lookup uses the tenant token, prefers the primary department and never blocks login', async () => {
  const tenantUrl = 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal';
  const contactUser = 'https://open.feishu.cn/open-apis/contact/v3/users/ou_a';
  const contactDept = 'https://open.feishu.cn/open-apis/contact/v3/departments/od-primary';
  const handlers = {
    [tokenUrl]: () => ({ code: 0, access_token: 'u-token' }),
    [userInfoUrl]: () => ({ code: 0, data: { name: 'Alice', open_id: 'ou_a', email: 'a@example.com' } }),
    [tenantUrl]: () => ({ code: 0, tenant_access_token: 't-token', expire: 7200 }),
    [contactUser]: () => ({ code: 0, data: { user: { department_ids: ['od-other', 'od-primary'], orders: [{ department_id: 'od-primary', is_primary_dept: true }] } } }),
    [contactDept]: () => ({ code: 0, data: { department: { name: 'Scene C Team' } } })
  };
  const { provider: p, calls } = provider(handlers, { fetchDepartment: true });
  assert.equal((await p.exchangeCode('c', redirectUri)).department, 'Scene C Team');
  assert.equal(calls.find((c) => c.url.startsWith(contactUser))?.headers.Authorization, 'Bearer t-token');

  const failing = provider({ ...handlers, [contactUser]: () => ({ code: 41050, msg: 'no user authority' }) }, { fetchDepartment: true });
  const identity = await failing.provider.exchangeCode('c', redirectUri);
  assert.equal(identity.department, undefined);
  assert.equal(identity.openId, 'ou_a');
});
