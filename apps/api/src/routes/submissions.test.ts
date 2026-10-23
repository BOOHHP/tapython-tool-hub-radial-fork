import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../app/createApp.js';
import type { ApiConfig } from '../config/env.js';

test('returns 413 when a repair package exceeds ZIP resource limits', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tapython-submission-route-'));
  const app = await createApp(createConfig(root));

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/submissions/package/repair',
      headers: { 'content-type': 'application/zip' },
      payload: zipWithDeclaredEntryCount(257)
    });

    assert.equal(response.statusCode, 413);
    assert.deepEqual(response.json(), {
      error: 'package_resource_limit',
      message: 'ZIP has too many entries: 257 > 256'
    });
  } finally {
    await app.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

function zipWithDeclaredEntryCount(count: number): Buffer {
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  return end;
}

function createConfig(root: string): ApiConfig {
  return {
    host: '127.0.0.1',
    port: 0,
    repoRoot: root,
    toolDataRoot: path.join(root, 'data', 'tools'),
    toolDocsRoot: path.join(root, 'data', 'tool-docs'),
    toolApiRoot: path.join(root, 'public', 'api', 'tools'),
    downloadRoot: path.join(root, 'public', 'downloads'),
    submissionRoot: path.join(root, 'submissions'),
    serveStatic: false,
    webStaticRoot: path.join(root, 'dist')
  };
}
