import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { expandInstallPath, resolveInside } from '../lib/paths.js';

describe('paths', () => {
  it('expandInstallPath replaces <Project> placeholder', () => {
    const result = expandInstallPath('<Project>/TA/TAPython/Python/Tool/', '/home/user/MyProject');
    assert.ok(result.includes('MyProject'));
    assert.ok(result.includes('TAPython'));
  });

  it('resolveInside allows safe relative paths', () => {
    const base = '/home/user/project';
    const result = resolveInside(base, 'subfolder/file.txt');
    assert.equal(result, path.resolve(base, 'subfolder/file.txt'));
  });

  it('resolveInside rejects path traversal', () => {
    const base = '/home/user/project';
    assert.throws(() => resolveInside(base, '../../../etc/passwd'), /escapes allowed directory/);
  });

  it('resolveInside rejects absolute path outside base', () => {
    const base = '/home/user/project';
    assert.throws(() => resolveInside(base, '/etc/passwd'), /escapes allowed directory/);
  });

  it('resolveInside allows the base directory itself', () => {
    const base = '/home/user/project';
    const result = resolveInside(base, '.');
    assert.equal(result, path.resolve(base));
  });
});
