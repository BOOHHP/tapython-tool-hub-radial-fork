import assert from 'node:assert/strict';
import test from 'node:test';
import { RateLimiter } from './rateLimiter.js';

test('allows up to the limit per key within a window and resets afterwards', () => {
  let clock = 0;
  const limiter = new RateLimiter(2, 1000, () => clock);
  assert.equal(limiter.allow('a'), true);
  assert.equal(limiter.allow('a'), true);
  assert.equal(limiter.allow('a'), false);
  assert.equal(limiter.allow('b'), true);
  clock = 1000;
  assert.equal(limiter.allow('a'), true);
});
