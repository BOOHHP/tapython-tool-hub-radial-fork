import { parseArgs } from 'node:util';
import fs from 'node:fs/promises';
import type { CommandContext } from '../lib/types.js';
import { CliError } from '../lib/types.js';
import { sha256Buffer, verifySha256 } from '../lib/hash.js';
import { readZipEntries } from '../lib/zip.js';
import { output, printHuman } from '../lib/output.js';

export async function run(ctx: CommandContext): Promise<void> {
  const { values } = parseArgs({
    args: ctx.args,
    options: {
      manifest: { type: 'string' },
      package: { type: 'string' },
      json: { type: 'boolean' },
    },
    allowPositionals: true,
    strict: false,
  });

  const manifestPath = (values.manifest as string) ?? '';
  const packagePath = (values.package as string) ?? '';
  const json = ctx.json || Boolean(values.json);

  if (!manifestPath) throw new CliError('--manifest is required', 'MISSING_ARG');
  if (!packagePath) throw new CliError('--package is required', 'MISSING_ARG');

  const manifestBuffer = await fs.readFile(manifestPath);
  const manifest = JSON.parse(manifestBuffer.toString('utf8')) as {
    files: Array<{ path: string; sha256: string; size: number }>;
  };

  const packageBuffer = await fs.readFile(packagePath);
  const entries = readZipEntries(packageBuffer);

  const results: Array<{ path: string; expected: string; actual: string; valid: boolean }> = [];
  let allValid = true;

  for (const file of manifest.files) {
    const entry = entries.find(e => e.path === file.path);
    if (!entry) {
      results.push({ path: file.path, expected: file.sha256, actual: '(missing)', valid: false });
      allValid = false;
      continue;
    }
    const actual = sha256Buffer(entry.content);
    const valid = verifySha256(actual, file.sha256);
    if (!valid) allValid = false;
    results.push({ path: file.path, expected: file.sha256, actual, valid });
  }

  if (json) {
    output('json', '', { valid: allValid, fileCount: manifest.files.length, results });
    return;
  }

  const lines = [
    allValid ? '✓ All files verified successfully.' : '✗ Verification failed!',
    '',
    `Files checked: ${manifest.files.length}`,
    '',
  ];

  for (const r of results) {
    const icon = r.valid ? '✓' : '✗';
    lines.push(`  ${icon} ${r.path}`);
    if (!r.valid) {
      lines.push(`    expected: ${r.expected}`);
      lines.push(`    actual:   ${r.actual}`);
    }
  }

  printHuman(lines);
  if (!allValid) process.exitCode = 1;
}
