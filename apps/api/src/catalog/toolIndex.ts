import fs from 'node:fs';
import path from 'node:path';
import type { SqliteDatabase } from '../database/sqlite.js';

interface IndexEntry {
  slug: string;
  name: string;
  displayName?: string;
  category?: string;
  author?: string;
  ownerTeam?: string;
  status?: string;
  riskLevel?: string;
  toolType?: string;
  collection?: string;
  latestVersion?: string;
  updatedAt?: string;
  sourceDocument?: string;
}

interface DetailVersion {
  version: string;
  releasedAt?: string;
  author?: string;
  downloads?: { packageSha256?: string; packageSize?: number };
}

const text = (value: unknown) => (typeof value === 'string' ? value : null);

function readJson<T>(file: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) as T;
  } catch {
    return undefined;
  }
}

// Full rebuild in one transaction. A missing or unreadable index leaves the table untouched
// rather than wiping it, so a half-written deploy never empties the catalog.
export function syncToolIndex(db: SqliteDatabase, toolApiRoot: string, now: () => Date = () => new Date()): { tools: number; versions: number } | undefined {
  const index = readJson<{ tools?: IndexEntry[] }>(path.join(toolApiRoot, 'index.json'));
  if (!index || !Array.isArray(index.tools)) {
    return undefined;
  }

  const stamp = now().toISOString();
  let versions = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec('DELETE FROM tools');
    const insertTool = db.prepare(
      `INSERT INTO tools (slug, name, display_name, category, author, owner_team, status, risk_level, tool_type, collection, latest_version, updated_at, source_document, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertVersion = db.prepare('INSERT OR REPLACE INTO tool_versions (slug, version, released_at, author, package_sha256, package_size) VALUES (?, ?, ?, ?, ?, ?)');
    for (const entry of index.tools) {
      insertTool.run(
        entry.slug, entry.name, entry.displayName ?? entry.name, text(entry.category), text(entry.author), text(entry.ownerTeam), text(entry.status),
        text(entry.riskLevel), text(entry.toolType), text(entry.collection), text(entry.latestVersion), text(entry.updatedAt), text(entry.sourceDocument), stamp
      );
      const detail = readJson<{ tool?: { versions?: DetailVersion[] } }>(path.join(toolApiRoot, `${entry.slug}.json`));
      for (const version of detail?.tool?.versions ?? []) {
        insertVersion.run(entry.slug, version.version, text(version.releasedAt), text(version.author), text(version.downloads?.packageSha256) || null, version.downloads?.packageSize ?? null);
        versions += 1;
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { tools: index.tools.length, versions };
}
