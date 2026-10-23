import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { generateToolData } from '@tapython-tool-hub/tooling';
import { demoToolMarkdown } from '../testSupport/demoTool.js';


async function generate(root: string, docsRoot: string, logicalDocsPath?: string) {
  await fs.mkdir(path.join(docsRoot, 'demo-tool'), { recursive: true });
  await fs.writeFile(path.join(docsRoot, 'demo-tool', 'demo-tool.md'), demoToolMarkdown, 'utf8');
  const apiRoot = path.join(root, 'api');
  await generateToolData({ root, toolDataRoot: path.join(root, 'tools'), toolDocsRoot: docsRoot, apiRoot, downloadRoot: path.join(root, 'downloads'), logicalDocsPath });
  return JSON.parse(await fs.readFile(path.join(apiRoot, 'demo-tool.json'), 'utf8')).tool.sourceDocument as string;
}

test('sourceDocument follows the repo layout by default and the logical path when relocated', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tapython-gen-'));
  try {
    assert.equal(await generate(path.join(root, 'a'), path.join(root, 'a', 'data', 'tool-docs')), 'data/tool-docs/demo-tool/demo-tool.md');
    assert.equal(await generate(path.join(root, 'b'), path.join(root, 'elsewhere', 'docs'), 'data/tool-docs'), 'data/tool-docs/demo-tool/demo-tool.md');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});