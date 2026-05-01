import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sha256Buffer, verifySha256 } from '../lib/hash.js';

describe('hash', () => {
  it('sha256Buffer computes correct hash for empty buffer', () => {
    const hash = sha256Buffer(Buffer.alloc(0));
    assert.equal(hash, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('sha256Buffer computes correct hash for known input', () => {
    const hash = sha256Buffer(Buffer.from('hello'));
    assert.equal(hash, '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('verifySha256 returns true for matching hashes', () => {
    const hash = sha256Buffer(Buffer.from('test'));
    assert.equal(verifySha256(hash, hash), true);
  });

  it('verifySha256 returns false for non-matching hashes', () => {
    const hash1 = sha256Buffer(Buffer.from('test1'));
    const hash2 = sha256Buffer(Buffer.from('test2'));
    assert.equal(verifySha256(hash1, hash2), false);
  });

  it('verifySha256 returns false for different length strings', () => {
    assert.equal(verifySha256('abc', 'abcdef'), false);
  });
});
