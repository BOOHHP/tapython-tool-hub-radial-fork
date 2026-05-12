import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../app/createApp.js';
import type { ApiConfig } from '../config/env.js';

test('serves markdown downloads as utf-8 markdown text', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tapython-download-route-'));
  const config: ApiConfig = {
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
  const filePath = path.join(config.downloadRoot, 'demo-tool', '1.0.0', 'tool.md');
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, '\uFEFF# Demo\n\n中文 Markdown 下载测试。\n', 'utf8');

  const app = await createApp(config);
  try {
    const response = await app.inject({ method: 'GET', url: '/downloads/demo-tool/1.0.0/tool.md' });

    assert.equal(response.statusCode, 200);
    assert.match(response.headers['content-type'] as string, /^text\/markdown; charset=utf-8/);
    assert.match(response.body, /中文 Markdown 下载测试/);
  } finally {
    await app.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('serves zip packages as binary archives', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tapython-download-route-'));
  const config = createConfig(root);
  const filePath = path.join(config.downloadRoot, 'demo-tool', '1.0.0', 'demo-tool-1.0.0.zip');
  const content = Buffer.from('PK\u0003\u0004demo archive');
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);

  const app = await createApp(config);
  try {
    const response = await app.inject({ method: 'GET', url: '/downloads/demo-tool/1.0.0/demo-tool-1.0.0.zip' });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['content-type'], 'application/zip');
    assert.deepEqual(response.rawPayload, content);
  } finally {
    await app.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

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