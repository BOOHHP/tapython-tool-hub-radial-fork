import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { generateToolData } from '@tapython-tool-hub/tooling';
import { demoToolMarkdown } from '../testSupport/demoTool.js';
import { memoryDb } from '../testSupport/submissions.js';
import { syncToolIndex } from './toolIndex.js';

async function generated(slug = 'demo-tool') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tapython-toolindex-'));
  const docsRoot = path.join(root, 'tool-docs');
  await fs.mkdir(path.join(docsRoot, slug), { recursive: true });
  await fs.writeFile(path.join(docsRoot, slug, `${slug}.md`), demoToolMarkdown.split('demo-tool').join(slug), 'utf8');
  const apiRoot = path.join(root, 'api');
  await generateToolData({ root, toolDataRoot: path.join(root, 'tools'), toolDocsRoot: docsRoot, apiRoot, downloadRoot: path.join(root, 'downloads') });
  return { root, apiRoot, docsRoot };
}

test('indexes published tools with their metadata and versions', async () => {
  const { apiRoot } = await generated();
  const db = await memoryDb();
  assert.deepEqual(syncToolIndex(db, apiRoot), { tools: 1, versions: 1 });

  const tool = db.prepare('SELECT * FROM tools WHERE slug = ?').get('demo-tool');
  assert.deepEqual(
    { name: tool?.name, category: tool?.category, author: tool?.author, ownerTeam: tool?.owner_team, status: tool?.status, latest: tool?.latest_version },
    { name: 'DemoTool', category: 'validation', author: 'QA Team', ownerTeam: 'QA', status: 'approved', latest: '1.0.0' }
  );
  assert.equal(db.prepare('SELECT version FROM tool_versions WHERE slug = ?').get('demo-tool')?.version, '1.0.0');
});

test('a re-sync mirrors removals and keeps the table when the index is missing', async () => {
  const first = await generated('demo-tool');
  const db = await memoryDb();
  syncToolIndex(db, first.apiRoot);

  const second = await generated('other-tool');
  syncToolIndex(db, second.apiRoot);
  assert.deepEqual(db.prepare('SELECT slug FROM tools').all().map((r) => r.slug), ['other-tool']);
  assert.equal(Number(db.prepare('SELECT COUNT(*) AS n FROM tool_versions').get()?.n), 1);

  assert.equal(syncToolIndex(db, path.join(second.root, 'nowhere')), undefined);
  assert.equal(Number(db.prepare('SELECT COUNT(*) AS n FROM tools').get()?.n), 1);
});

test('a tool without a readable detail file is still indexed', async () => {
  const { apiRoot } = await generated();
  await fs.rm(path.join(apiRoot, 'demo-tool.json'));
  const db = await memoryDb();
  assert.deepEqual(syncToolIndex(db, apiRoot), { tools: 1, versions: 0 });
});
