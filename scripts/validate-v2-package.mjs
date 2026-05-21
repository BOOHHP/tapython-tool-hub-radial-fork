import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { tapythonToolPackageManifestSchema } from '../packages/shared/dist/index.js';

const packagePath = process.argv[2];
if (!packagePath) {
  console.error('Usage: node scripts/validate-v2-package.mjs <package.zip>');
  process.exit(1);
}

const resolvedPackagePath = path.resolve(packagePath);
if (!fs.existsSync(resolvedPackagePath)) {
  console.error(`Package not found: ${resolvedPackagePath}`);
  process.exit(1);
}

const entries = readZipEntries(fs.readFileSync(resolvedPackagePath));
const manifestEntry = entries.get('manifest.json');
if (!manifestEntry) {
  fail('Package is missing manifest.json');
}

const manifest = JSON.parse(manifestEntry.content.toString('utf8'));
const parseResult = tapythonToolPackageManifestSchema.safeParse(manifest);
if (!parseResult.success) {
  const details = parseResult.error.issues
    .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
    .join('\n');
  fail(`manifest.json failed schema validation:\n${details}`);
}

const problems = [];
for (const file of manifest.files) {
  if (!isSafePackagePath(file.path)) {
    problems.push(`${file.path}: unsafe package path`);
    continue;
  }

  const entry = entries.get(file.path);
  if (!entry) {
    problems.push(`${file.path}: listed in manifest but missing from ZIP`);
    continue;
  }

  const sha256 = crypto.createHash('sha256').update(entry.content).digest('hex');
  if (sha256 !== file.sha256) {
    problems.push(`${file.path}: sha256 mismatch, expected ${file.sha256}, got ${sha256}`);
  }

  if (entry.content.length !== file.size) {
    problems.push(`${file.path}: size mismatch, expected ${file.size}, got ${entry.content.length}`);
  }
}

for (const entryName of entries.keys()) {
  if (entryName === 'manifest.json') continue;
  if (!isSafePackagePath(entryName)) {
    problems.push(`${entryName}: unsafe ZIP entry path`);
  }
}

if (problems.length > 0) {
  fail(`Package validation failed:\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
}

const packageSha256 = crypto.createHash('sha256').update(fs.readFileSync(resolvedPackagePath)).digest('hex');
console.log(JSON.stringify({
  ok: true,
  package: resolvedPackagePath,
  packageSha256,
  manifest: `${manifest.slug}@${manifest.version}`,
  files: manifest.files.length,
  menuEntries: manifest.menuEntries.length
}, null, 2));

function fail(message) {
  console.error(message);
  process.exit(1);
}

function isSafePackagePath(value) {
  if (!value || value.startsWith('/') || /^[a-zA-Z]:/.test(value)) return false;
  return value.split('/').every((segment) => segment && segment !== '.' && segment !== '..');
}

function readZipEntries(buffer) {
  const endOffset = findEndOfCentralDirectory(buffer);
  const totalEntries = buffer.readUInt16LE(endOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(endOffset + 16);
  let offset = centralDirectoryOffset;
  const entries = new Map();

  for (let index = 0; index < totalEntries; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      fail(`Invalid ZIP central directory at offset ${offset}`);
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString('utf8');

    if (compressionMethod !== 0) {
      fail(`${fileName}: unsupported ZIP compression method ${compressionMethod}`);
    }

    const content = readLocalEntryContent(buffer, localHeaderOffset, compressedSize);
    entries.set(fileName, { content });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function readLocalEntryContent(buffer, localHeaderOffset, compressedSize) {
  if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
    fail(`Invalid ZIP local header at offset ${localHeaderOffset}`);
  }

  const fileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
  const extraLength = buffer.readUInt16LE(localHeaderOffset + 28);
  const contentOffset = localHeaderOffset + 30 + fileNameLength + extraLength;
  return buffer.subarray(contentOffset, contentOffset + compressedSize);
}

function findEndOfCentralDirectory(buffer) {
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }

  fail('Invalid ZIP: end of central directory not found');
}
