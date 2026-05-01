import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { readZipEntries } from '../lib/zip.js';
import { sha256Buffer } from '../lib/hash.js';

describe('zip', () => {
  const fixtureDir = path.resolve(import.meta.dirname, '../../../../apps/web/public/downloads/actor-rename-tool/1.2.0');

  it('reads entries from a generated ZIP file', async () => {
    const zipPath = path.join(fixtureDir, 'actor-rename-tool-1.2.0.zip');
    const buffer = await fs.readFile(zipPath);
    const entries = readZipEntries(buffer);

    assert.ok(entries.length > 0, 'should have at least one entry');
    const paths = entries.map(e => e.path);
    assert.ok(paths.includes('manifest.json'), 'should contain manifest.json');
  });

  it('entry content matches manifest sha256', async () => {
    const zipPath = path.join(fixtureDir, 'actor-rename-tool-1.2.0.zip');
    const manifestPath = path.join(fixtureDir, 'manifest.json');

    const buffer = await fs.readFile(zipPath);
    const entries = readZipEntries(buffer);

    const manifestContent = await fs.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestContent) as { files: Array<{ path: string; sha256: string }> };

    for (const file of manifest.files) {
      const entry = entries.find(e => e.path === file.path);
      assert.ok(entry, `ZIP should contain ${file.path}`);
      const hash = sha256Buffer(entry!.content);
      assert.equal(hash, file.sha256, `SHA256 mismatch for ${file.path}`);
    }
  });

  it('throws on invalid buffer', () => {
    assert.throws(() => readZipEntries(Buffer.from('not a zip')), /not a valid ZIP/);
  });
});
