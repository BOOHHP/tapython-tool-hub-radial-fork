#!/usr/bin/env node
// Read-only inventory of Hub data files: per-file sha256 plus per-category aggregate hashes.
// Usage: node scripts/server/inventory.mjs --root <hub root> --out <inventory.json>
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const categories = {
  toolDocs: 'data/tool-docs',
  toolApi: 'apps/web/public/api/tools',
  downloads: 'apps/web/public/downloads',
  submissions: '.tapython-tool-hub/submissions'
};

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    args[argv[i].replace(/^--/, '')] = argv[i + 1];
  }
  if (!args.root || !args.out) {
    throw new Error('Usage: inventory.mjs --root <hub root> --out <inventory.json>');
  }
  return args;
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch((error) => (error.code === 'ENOENT' ? [] : Promise.reject(error)));
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

async function inventoryCategory(root, relative) {
  const base = path.join(root, relative);
  const files = [];
  for (const full of await walk(base)) {
    const buffer = await fs.readFile(full);
    files.push({ path: path.relative(base, full).split(path.sep).join('/'), size: buffer.length, sha256: sha256(buffer) });
  }
  files.sort((a, b) => (a.path < b.path ? -1 : 1));
  const aggregate = sha256(files.map((f) => `${f.path}:${f.sha256}`).join('\n'));
  return { root: relative, fileCount: files.length, totalBytes: files.reduce((n, f) => n + f.size, 0), aggregateSha256: aggregate, files };
}

async function summarizeSubmissions(root) {
  const dir = path.join(root, categories.submissions);
  const records = [];
  for (const name of (await fs.readdir(dir).catch(() => [])).filter((n) => n.endsWith('.json'))) {
    const raw = await fs.readFile(path.join(dir, name));
    const json = JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, ''));
    records.push({
      id: json.id,
      slug: json.slug,
      status: json.status,
      submitter: json.submitter,
      reviews: Array.isArray(json.reviews) ? json.reviews.length : 0,
      createdAt: json.createdAt,
      sha256: sha256(raw)
    });
  }
  records.sort((a, b) => (a.id < b.id ? -1 : 1));
  const countBy = (key) => records.reduce((acc, r) => ({ ...acc, [r[key] ?? '(none)']: (acc[r[key] ?? '(none)'] ?? 0) + 1 }), {});
  return {
    total: records.length,
    distinctSlugs: new Set(records.map((r) => r.slug)).size,
    reviewEntries: records.reduce((n, r) => n + r.reviews, 0),
    byStatus: countBy('status'),
    bySubmitter: countBy('submitter'),
    records
  };
}

async function toolSummary(root) {
  const dir = path.join(root, categories.toolDocs);
  const slugs = (await fs.readdir(dir, { withFileTypes: true }).catch(() => [])).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  return { toolDirectories: slugs.length, slugs };
}

const { root, out } = parseArgs(process.argv.slice(2));
const inventory = { generatedAt: new Date().toISOString(), root: path.resolve(root), categories: {} };
for (const [name, relative] of Object.entries(categories)) {
  inventory.categories[name] = await inventoryCategory(root, relative);
}
inventory.tools = await toolSummary(root);
inventory.submissionRecords = await summarizeSubmissions(root);
await fs.mkdir(path.dirname(path.resolve(out)), { recursive: true });
await fs.writeFile(out, `${JSON.stringify(inventory, null, 2)}\n`, 'utf8');

const line = (name, c) => `${name}: files=${c.fileCount} bytes=${c.totalBytes} sha256=${c.aggregateSha256.slice(0, 16)}`;
for (const [name, c] of Object.entries(inventory.categories)) {
  console.log(line(name, c));
}
console.log(`toolDirectories=${inventory.tools.toolDirectories} submissions=${inventory.submissionRecords.total} slugs=${inventory.submissionRecords.distinctSlugs}`);
