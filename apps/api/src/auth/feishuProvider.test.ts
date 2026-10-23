import assert from 'node:assert/strict';
import test from 'node:test';
import { createFeishuProvider, FeishuAuthError, MockFeishuProvider } from './feishuProvider.js';

test('mock provider derives a stable identity from the code', async () => {
  const provider = new MockFeishuProvider();
  const first = await provider.exchangeCode('mock:alice@example.com', 'http://127.0.0.1:8787/auth/feishu/callback');
  const again = await provider.exchangeCode('mock:alice@example.com', 'http://127.0.0.1:8787/auth/feishu/callback');
  const other = await provider.exchangeCode('mock:bob@example.com', 'http://127.0.0.1:8787/auth/feishu/callback');

  assert.deepEqual(first, again);
  assert.notEqual(first.openId, other.openId);
  assert.match(first.openId, /^ou_mock_/);
  assert.match(first.unionId ?? '', /^on_mock_/);
  assert.equal(first.email, 'alice@example.com');
  assert.equal(first.name, 'alice');
});

test('mock provider rejects codes it did not issue', async () => {
  const provider = new MockFeishuProvider();
  await assert.rejects(() => provider.exchangeCode('real-looking-code', 'x'), (error: unknown) => error instanceof FeishuAuthError && error.code === 'invalid_code');
  await assert.rejects(() => provider.exchangeCode('mock:', 'x'), FeishuAuthError);
});

test('mock authorize url returns to the callback with a code and the original state', () => {
  const provider = new MockFeishuProvider('carol@example.com');
  const url = new URL(provider.buildAuthorizeUrl('state-123', 'http://127.0.0.1:8787/auth/feishu/callback'));
  assert.equal(url.origin + url.pathname, 'http://127.0.0.1:8787/auth/feishu/callback');
  assert.equal(url.searchParams.get('state'), 'state-123');
  assert.equal(url.searchParams.get('code'), 'mock:carol@example.com');
});

test('factory stays off unless configured', () => {
  assert.equal(createFeishuProvider({}), undefined);
});

test('mock provider is only allowed on a loopback host so it can never ship to the server by accident', () => {
  assert.ok(createFeishuProvider({ provider: 'mock', host: '127.0.0.1' }) instanceof MockFeishuProvider);
  assert.ok(createFeishuProvider({ provider: 'mock', host: 'localhost' }) instanceof MockFeishuProvider);
  assert.throws(() => createFeishuProvider({ provider: 'mock', host: '0.0.0.0' }), /loopback/i);
  assert.throws(() => createFeishuProvider({ provider: 'mock', host: '10.2.13.8' }), /loopback/i);
});

test('the real provider is not available before phase 1', () => {
  assert.throws(() => createFeishuProvider({ provider: 'real', host: '127.0.0.1' }), /phase 1/i);
  assert.throws(() => createFeishuProvider({ provider: 'bogus', host: '127.0.0.1' }), /unknown/i);
});
