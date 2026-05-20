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