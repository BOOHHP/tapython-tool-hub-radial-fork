// Frozen public contract consumed by the Installer, CLI and agents.
// Any change that breaks these assertions must ship behind a new API prefix instead.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createApp } from '../app/createApp.js';
import type { ApiConfig } from '../config/env.js';

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'contract');
const goldenDir = path.join(fixtureDir, 'golden');
const slug = 'ue-python-toolkit';

// Golden files record what the API returned when the contract was frozen.
// Refresh deliberately with UPDATE_CONTRACT=1 and review the diff.
async function expectGolden(name: string, actual: unknown, message: string) {
  const file = path.join(goldenDir, name);
  if (process.env.UPDATE_CONTRACT === '1') {
    await fs.mkdir(goldenDir, { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(actual, null, 2)}\n`, 'utf8');
    return;
  }
  assert.deepEqual(actual, JSON.parse(await fs.readFile(file, 'utf8')), message);
}

async function withApp(run: (ctx: { app: Awaited<ReturnType<typeof createApp>>; config: ApiConfig }) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tapython-contract-'));
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
  await fs.mkdir(config.toolApiRoot, { recursive: true });
  await fs.copyFile(path.join(fixtureDir, 'index.json'), path.join(config.toolApiRoot, 'index.json'));
  await fs.copyFile(path.join(fixtureDir, `${slug}.json`), path.join(config.toolApiRoot, `${slug}.json`));

  const app = await createApp(config);
  try {
    await run({ app, config });
  } finally {
    await app.close();
    await fs.rm(root, { recursive: true, force: true });
  }
}

// Fields may only be added to these responses, never removed or renamed.
function assertHasKeys(value: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    assert.ok(key in value, `missing contract key: ${key}`);
  }
}

async function readFixture(name: string) {
  return JSON.parse(await fs.readFile(path.join(fixtureDir, name), 'utf8'));
}

test('GET /api/tools and /api/tools/index.json return the frozen index', async () => {
  await withApp(async ({ app }) => {
    for (const url of ['/api/tools', '/api/tools/index.json']) {
      const response = await app.inject({ method: 'GET', url });
      assert.equal(response.statusCode, 200, url);
      await expectGolden('index.response.json', response.json(), url);
    }
  });
});

test('GET /api/tools/:slug returns the frozen detail, with or without .json', async () => {
  await withApp(async ({ app }) => {
    for (const url of [`/api/tools/${slug}`, `/api/tools/${slug}.json`]) {
      const response = await app.inject({ method: 'GET', url });
      assert.equal(response.statusCode, 200, url);
      await expectGolden(`${slug}.response.json`, response.json(), url);
    }
  });
});

test('unknown or malformed slugs return 404 tool_not_found', async () => {
  await withApp(async ({ app }) => {
    for (const url of ['/api/tools/does-not-exist', '/api/tools/Bad_Slug', '/api/tools/does-not-exist/install-prompt']) {
      const response = await app.inject({ method: 'GET', url });
      assert.equal(response.statusCode, 404, url);
      assert.deepEqual(response.json(), { error: 'tool_not_found' }, url);
    }
  });
});

test('install-plan-template keeps the exact key set the Installer reads', async () => {
  const detail = await readFixture(`${slug}.json`);
  const version = detail.tool.versions[0].version as string;
  await withApp(async ({ app }) => {
    const response = await app.inject({ method: 'GET', url: `/api/tools/${slug}/versions/${version}/install-plan-template` });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assertHasKeys(body, [
      'cliCommand', 'displayName', 'downloads', 'installPath', 'manifest', 'mountPoint',
      'postInstallSteps', 'preInstallChecks', 'riskLevel', 'riskNotes', 'slug', 'version'
    ]);
    assertHasKeys(body.downloads, ['manifest', 'package', 'packageSha256', 'packageSize']);
    assert.equal(body.slug, slug);
    assert.equal(body.version, version);

    const missing = await app.inject({ method: 'GET', url: `/api/tools/${slug}/versions/0.0.0/install-plan-template` });
    assert.equal(missing.statusCode, 404);
    assert.deepEqual(missing.json(), { error: 'version_not_found' });
  });
});

test('package.sha256 and install-prompt are plain utf-8 text', async () => {
  const detail = await readFixture(`${slug}.json`);
  const version = detail.tool.versions[0].version as string;
  await withApp(async ({ app }) => {
    const sha = await app.inject({ method: 'GET', url: `/api/tools/${slug}/versions/${version}/package.sha256` });
    assert.equal(sha.statusCode, 200);
    assert.match(sha.headers['content-type'] as string, /^text\/plain; charset=utf-8/);
    assert.equal(sha.body, detail.tool.versions[0].downloads.packageSha256);

    const prompt = await app.inject({ method: 'GET', url: `/api/tools/${slug}/install-prompt` });
    assert.equal(prompt.statusCode, 200);
    assert.match(prompt.headers['content-type'] as string, /^text\/plain; charset=utf-8/);
    assert.match(prompt.body, new RegExp(`tapython-tool-hub install ${slug} --hub http://`));
  });
});

test('downloads stay anonymous, typed by extension and 404 with download_not_found', async () => {
  await withApp(async ({ app, config }) => {
    const base = path.join(config.downloadRoot, slug, '1.0.0');
    await fs.mkdir(base, { recursive: true });
    await fs.writeFile(path.join(base, 'manifest.json'), '{"ok":true}', 'utf8');
    await fs.writeFile(path.join(base, 'pkg.zip'), Buffer.from('PK\u0003\u0004x'));

    const json = await app.inject({ method: 'GET', url: `/downloads/${slug}/1.0.0/manifest.json` });
    assert.equal(json.statusCode, 200);
    assert.match(json.headers['content-type'] as string, /^application\/json; charset=utf-8/);

    const zip = await app.inject({ method: 'GET', url: `/downloads/${slug}/1.0.0/pkg.zip` });
    assert.equal(zip.statusCode, 200);
    assert.equal(zip.headers['content-type'], 'application/zip');

    const missing = await app.inject({ method: 'GET', url: `/downloads/${slug}/1.0.0/nope.zip` });
    assert.equal(missing.statusCode, 404);
    assert.deepEqual(missing.json(), { error: 'download_not_found' });
  });
});

test('/health and /api/health keep status, service, uptime and database', async () => {
  await withApp(async ({ app }) => {
    for (const url of ['/health', '/api/health']) {
      const response = await app.inject({ method: 'GET', url });
      assert.equal(response.statusCode, 200, url);
      const body = response.json();
      assert.equal(body.service, 'tapython-tool-hub-api');
      assertHasKeys(body, ['database', 'service', 'status', 'uptime']);
    }
  });
});
