import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../app/createApp.js';
import type { ApiConfig } from '../config/env.js';
import { createPasswordHash } from '../services/authService.js';

test('requires an admin session for admin routes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tapython-admin-auth-'));
  const app = await createApp(createConfig(root));
  try {
    const response = await app.inject({ method: 'GET', url: '/api/admin/submissions' });
    assert.equal(response.statusCode, 401);
  } finally {
    await app.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('logs in with configured admin credentials and allows admin routes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tapython-admin-auth-'));
  const app = await createApp(createConfig(root));
  try {
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'correct-password' }
    });
    assert.equal(loginResponse.statusCode, 200);
    const cookie = loginResponse.cookies[0];
    assert.equal(cookie.name, 'tapython_admin_session');
    assert.equal(cookie.httpOnly, true);

    const adminResponse = await app.inject({
      method: 'GET',
      url: '/api/admin/submissions',
      headers: { cookie: `${cookie.name}=${cookie.value}` }
    });
    assert.equal(adminResponse.statusCode, 200);
    assert.equal(adminResponse.json().total, 0);
  } finally {
    await app.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('admin can completely delete a published uploaded tool', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tapython-admin-auth-'));
  const config = createConfig(root);
  const app = await createApp(config);
  try {
    const slug = 'delete-me-tool';
    const toolDocRoot = path.join(config.toolDocsRoot, slug);
    const toolApiPath = path.join(config.toolApiRoot, `${slug}.json`);
    const downloadRoot = path.join(config.downloadRoot, slug, '1.0.0');

    await fs.mkdir(toolDocRoot, { recursive: true });
    await fs.writeFile(path.join(toolDocRoot, `${slug}.md`), publishedToolMarkdown(slug), 'utf8');
    await fs.mkdir(path.dirname(toolApiPath), { recursive: true });
    await fs.writeFile(toolApiPath, '{"tool":{"slug":"delete-me-tool"}}\n', 'utf8');
    await fs.mkdir(downloadRoot, { recursive: true });
    await fs.writeFile(path.join(downloadRoot, `${slug}-1.0.0.zip`), 'placeholder', 'utf8');

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'correct-password' }
    });
    const cookie = loginResponse.cookies[0];

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/api/admin/tools/${slug}`,
      headers: { cookie: `${cookie.name}=${cookie.value}` }
    });

    assert.equal(deleteResponse.statusCode, 204);
    await assert.rejects(fs.stat(toolDocRoot), /ENOENT/);
    await assert.rejects(fs.stat(toolApiPath), /ENOENT/);
    await assert.rejects(fs.stat(path.join(config.downloadRoot, slug)), /ENOENT/);

    const indexPayload = JSON.parse(await fs.readFile(path.join(config.toolApiRoot, 'index.json'), 'utf8')) as { total?: number };
    assert.equal(indexPayload.total, 0);
  } finally {
    await app.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('rejects invalid admin credentials', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tapython-admin-auth-'));
  const app = await createApp(createConfig(root));
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'wrong-password' }
    });
    assert.equal(response.statusCode, 401);
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
    webStaticRoot: path.join(root, 'dist'),
    adminUsername: 'admin',
    adminPasswordHash: createPasswordHash('correct-password', 'test-salt', 210000),
    authSessionSecret: 'test-session-secret-with-enough-length',
    adminSessionTtlHours: 12
  };
}

function publishedToolMarkdown(slug: string): string {
  return `---
schemaVersion: "1.0.0"
slug: ${slug}
name: DeleteMeTool
displayName: Delete Me Tool
version: "1.0.0"
releasedAt: "2026-05-21"
updatedAt: "2026-05-21"
author: QA Team
ownerTeam: QA
status: approved
description: Temporary published tool for delete route coverage.
category: validation
riskLevel: low
sourceMode: v2-package-upload
tags: [delete, admin]
compatibility:
  unrealEngine: ["5.4"]
  tapython: ["1.2+"]
  plugins: ["TAPython"]
dependencies: []
mountPoint: OnToolBarChameleon
installPath: <Project>/TA/TAPython/Python/DeleteMeTool/
entryJson: DeleteMeTool/DeleteMeTool.json
changeSummary: Initial upload.
summary:
  features:
    - Delete route coverage
  unrealApis: []
  widgetAkas: []
  installSteps: []
  riskNotes: []
menuConfigMerge:
  target: <Project>/TA/TAPython/UI/MenuConfig.json
  mountPoint: OnToolBarChameleon
  itemsToAdd: []
preInstallChecks: []
postInstallSteps: []
uninstallSteps: []
---

# Delete Me Tool
`;
}