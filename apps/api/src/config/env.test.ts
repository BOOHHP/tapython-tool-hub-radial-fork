import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { resolveDataRoots } from './env.js';

const repo = path.resolve('/srv/hub');

test('without ARTIFACT_ROOT the data roots stay inside the repo', () => {
  const roots = resolveDataRoots(repo, {});
  assert.equal(roots.toolDocsRoot, path.join(repo, 'data', 'tool-docs'));
  assert.equal(roots.downloadRoot, path.join(repo, 'apps', 'web', 'public', 'downloads'));
  assert.equal(roots.artifactRoot, undefined);
  assert.equal(roots.logicalDocsPath, undefined);
});

test('ARTIFACT_ROOT relocates every data root and keeps the published doc path stable', () => {
  const artifacts = path.resolve('/srv/hub/.tapython-tool-hub/artifacts');
  const roots = resolveDataRoots(repo, { ARTIFACT_ROOT: artifacts });
  assert.equal(roots.toolDocsRoot, path.join(artifacts, 'tool-docs'));
  assert.equal(roots.toolApiRoot, path.join(artifacts, 'api', 'tools'));
  assert.equal(roots.downloadRoot, path.join(artifacts, 'downloads'));
  assert.equal(roots.toolDataRoot, path.join(artifacts, 'tools'));
  assert.equal(roots.logicalDocsPath, 'data/tool-docs');
});

test('explicit roots win and "off" disables the relocation', () => {
  const custom = path.resolve('/elsewhere/docs');
  assert.equal(resolveDataRoots(repo, { ARTIFACT_ROOT: '/a', TOOL_DOCS_ROOT: custom }).toolDocsRoot, custom);
  const off = resolveDataRoots(repo, { ARTIFACT_ROOT: 'off' });
  assert.equal(off.artifactRoot, undefined);
  assert.equal(off.toolDocsRoot, path.join(repo, 'data', 'tool-docs'));
});