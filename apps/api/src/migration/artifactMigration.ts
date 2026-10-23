import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Repo-relative locations that held server-authoritative data before artifacts/ existed.
const sources = [
  { from: 'data/tool-docs', to: 'tool-docs' },
  { from: 'apps/web/public/downloads', to: 'downloads' },
  { from: 'apps/web/public/api/tools', to: 'api/tools' },
  { from: 'data/tools', to: 'tools' }
];

const markerName = '.migrated.json';

export interface ArtifactMigrationResult {
  status: 'migrated' | 'already_migrated' | 'failed';
  files?: number;
  bytes?: number;
  problems?: string[];
}

function listFiles(root: string): string[] {
  if (!fs.existsSync(root)) {
    return [];
  }
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(root, entry.name);
    return entry.isDirectory() ? listFiles(full) : entry.isFile() ? [full] : [];
  });
}

const sha256 = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

// Copy, never move: the repo copies stay as a rollback until a later deploy replaces them.
// The marker is written last, only after every copied file matches its source by hash.
export function migrateArtifacts(repoRoot: string, artifactRoot: string, now: () => Date = () => new Date()): ArtifactMigrationResult {
  if (fs.existsSync(path.join(artifactRoot, markerName))) {
    return { status: 'already_migrated' };
  }

  const problems: string[] = [];
  let files = 0;
  let bytes = 0;
  const manifest: string[] = [];

  for (const { from, to } of sources) {
    const sourceRoot = path.join(repoRoot, from);
    const targetRoot = path.join(artifactRoot, to);
    for (const file of listFiles(sourceRoot)) {
      const relative = path.relative(sourceRoot, file);
      const target = path.join(targetRoot, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(file, target);
      // Windows carries the read-only attribute across; the API must be able to rewrite these files.
      fs.chmodSync(target, 0o666);
    }
    const expected = new Map(listFiles(sourceRoot).map((file) => [path.relative(sourceRoot, file), file]));
    const actual = new Set(listFiles(targetRoot).map((file) => path.relative(targetRoot, file)));
    for (const [relative, file] of expected) {
      const copied = path.join(targetRoot, relative);
      if (!actual.has(relative) || sha256(copied) !== sha256(file)) {
        problems.push(`copy differs: ${from}/${relative}`);
        continue;
      }
      files += 1;
      bytes += fs.statSync(file).size;
      manifest.push(`${to}/${relative.split(path.sep).join('/')}:${sha256(file)}`);
    }
    for (const relative of actual) {
      if (!expected.has(relative)) {
        problems.push(`unexpected file in target: ${to}/${relative}`);
      }
    }
  }

  if (problems.length > 0) {
    return { status: 'failed', problems: problems.slice(0, 50) };
  }
  const aggregate = createHash('sha256').update(manifest.sort().join('\n')).digest('hex');
  fs.mkdirSync(artifactRoot, { recursive: true });
  fs.writeFileSync(path.join(artifactRoot, markerName), `${JSON.stringify({ migratedAt: now().toISOString(), files, bytes, aggregateSha256: aggregate }, null, 2)}\n`, 'utf8');
  return { status: 'migrated', files, bytes };
}
