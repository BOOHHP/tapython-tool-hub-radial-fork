import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../app/createApp.js';
import type { ApiConfig } from '../config/env.js';
import { openHubDatabase } from './hubDatabase.js';

async function withTempRoot(run: (root: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tapython-hubdb-'));
  try {
    await run(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

function createConfig(root: string, extra: Partial<ApiConfig> = {}): ApiConfig {
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
    webStaticRoot: path.join(root, 'dist'),
    ...extra
  };
}

test('openHubDatabase is off by default', async () => {
  await withTempRoot(async (root) => {
    assert.equal(await openHubDatabase(createConfig(root)), undefined);
  });
});

test('openHubDatabase creates the file, applies the shipped migrations and reports the schema version', async () => {
  await withTempRoot(async (root) => {
    const sqlitePath = path.join(root, '.tapython-tool-hub', 'hub.sqlite');
    const hub = await openHubDatabase(createConfig(root, { sqlitePath }));
    assert.ok(hub);
    try {
      assert.ok(hub.schemaVersion >= 1);
      const table = hub.db.prepare("SELECT name FROM sqlite_master WHERE name = 'hub_meta'").get();
      assert.ok(table);
    } finally {
      hub.db.close();
    }
    await fs.access(sqlitePath);
  });
});

test('/health reports sqlite only when it is configured', async () => {
  await withTempRoot(async (root) => {
    const plain = await createApp(createConfig(root));
    try {
      const body = (await plain.inject({ method: 'GET', url: '/health' })).json();
      assert.equal('sqlite' in body, false);
    } finally {
      await plain.close();
    }

    const sqlitePath = path.join(root, '.tapython-tool-hub', 'hub.sqlite');
    const app = await createApp(createConfig(root, { sqlitePath }));
    try {
      const body = (await app.inject({ method: 'GET', url: '/health' })).json();
      assert.equal(body.sqlite.configured, true);
      assert.equal(body.sqlite.ok, true);
      assert.ok(body.sqlite.schemaVersion >= 1);
    } finally {
      await app.close();
    }
  });
});
