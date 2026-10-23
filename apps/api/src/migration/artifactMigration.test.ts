import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { migrateArtifacts } from './artifactMigration.js';

function layout() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tapython-artifacts-'));
  const repo = path.join(root, 'repo');
  const files: Record<string, string> = {
    'data/tool-docs/demo/demo.md': '# demo',
    'apps/web/public/downloads/demo/1.0.0/manifest.json': '{}',
    'apps/web/public/downloads/demo/1.0.0/demo-1.0.0.zip': 'zip',
    'apps/web/public/api/tools/index.json': '{"total":1}',
    'data/tools/legacy.json': '{}'
  };
  for (const [relative, content] of Object.entries(files)) {
    const full = path.join(repo, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return { repo, artifacts: path.join(root, 'artifacts') };
}

test('copies every data tree into artifacts, keeps the originals and writes the marker last', () => {
  const { repo, artifacts } = layout();
  const result = migrateArtifacts(repo, artifacts);
  assert.deepEqual({ status: result.status, files: result.files }, { status: 'migrated', files: 5 });

  assert.equal(fs.readFileSync(path.join(artifacts, 'tool-docs/demo/demo.md'), 'utf8'), '# demo');
  assert.equal(fs.readFileSync(path.join(artifacts, 'downloads/demo/1.0.0/demo-1.0.0.zip'), 'utf8'), 'zip');
  assert.ok(fs.existsSync(path.join(artifacts, 'api/tools/index.json')));
  assert.ok(fs.existsSync(path.join(artifacts, 'tools/legacy.json')));
  assert.ok(fs.existsSync(path.join(repo, 'data/tool-docs/demo/demo.md')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(artifacts, '.migrated.json'), 'utf8')).files, 5);
});

test('a second run never copies again, so later edits in artifacts survive', () => {
  const { repo, artifacts } = layout();
  migrateArtifacts(repo, artifacts);
  fs.writeFileSync(path.join(artifacts, 'tool-docs/demo/demo.md'), '# edited in artifacts');
  fs.writeFileSync(path.join(repo, 'data/tool-docs/demo/demo.md'), '# stale repo copy');
  assert.equal(migrateArtifacts(repo, artifacts).status, 'already_migrated');
  assert.equal(fs.readFileSync(path.join(artifacts, 'tool-docs/demo/demo.md'), 'utf8'), '# edited in artifacts');
});

test('a target holding unexpected files fails without a marker and can be retried', () => {
  const { repo, artifacts } = layout();
  fs.mkdirSync(path.join(artifacts, 'tool-docs/ghost'), { recursive: true });
  fs.writeFileSync(path.join(artifacts, 'tool-docs/ghost/ghost.md'), 'leftover');
  const result = migrateArtifacts(repo, artifacts);
  assert.equal(result.status, 'failed');
  assert.match(String(result.problems), /unexpected file in target/);
  assert.equal(fs.existsSync(path.join(artifacts, '.migrated.json')), false);

  fs.rmSync(path.join(artifacts, 'tool-docs/ghost'), { recursive: true });
  assert.equal(migrateArtifacts(repo, artifacts).status, 'migrated');
});

test('missing source trees are simply skipped', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tapython-artifacts-'));
  fs.mkdirSync(path.join(root, 'repo'));
  assert.deepEqual(migrateArtifacts(path.join(root, 'repo'), path.join(root, 'artifacts')), { status: 'migrated', files: 0, bytes: 0 });
});
