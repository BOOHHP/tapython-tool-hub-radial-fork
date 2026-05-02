import { parseArgs } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { CommandContext } from '../lib/types.js';
import { CliError } from '../lib/types.js';
import { fetchJson, fetchBuffer, resolveUrl } from '../lib/http.js';
import { sha256Buffer, verifySha256 } from '../lib/hash.js';
import { output, printHuman } from '../lib/output.js';

interface ToolDetailForDownload {
  tool: {
    slug: string;
    displayName: string;
    versions: Array<{
      version: string;
      downloads: { manifest: string; package: string; readme: string; packageSha256?: string };
    }>;
  };
}

export async function run(ctx: CommandContext): Promise<void> {
  const { values, positionals } = parseArgs({
    args: ctx.args,
    options: {
      hub: { type: 'string' },
      version: { type: 'string' },
      output: { type: 'string' },
      json: { type: 'boolean' },
    },
    allowPositionals: true,
    strict: false,
  });

  const hub = (values.hub as string) ?? '';
  if (!hub) throw new CliError('--hub is required', 'MISSING_ARG');

  const slug = positionals[0];
  if (!slug) throw new CliError('Tool slug is required', 'MISSING_ARG');

  const outputDir = (values.output as string) ?? '.';
  const requestedVersion = values.version as string | undefined;
  const json = ctx.json || Boolean(values.json);

  const hubBase = hub.replace(/\/$/, '');
  const url = `${hubBase}/api/tools/${slug}.json`;
  const data = await fetchJson<ToolDetailForDownload>(url);

  const version = requestedVersion
    ? data.tool.versions.find(v => v.version === requestedVersion)
    : data.tool.versions[0];

  if (!version) {
    throw new CliError(`Version ${requestedVersion} not found for ${slug}`, 'VERSION_NOT_FOUND');
  }

  const absOutput = path.resolve(outputDir);
  await fs.mkdir(absOutput, { recursive: true });

  const manifestUrl = resolveUrl(version.downloads.manifest, hubBase);
  const manifestBuffer = await fetchBuffer(manifestUrl);
  const manifestPath = path.join(absOutput, 'manifest.json');
  await fs.writeFile(manifestPath, manifestBuffer);

  const results: Array<{ file: string; path: string; size: number; sha256?: string; sha256Valid?: boolean }> = [
    { file: 'manifest.json', path: manifestPath, size: manifestBuffer.length },
  ];

  if (version.downloads.package) {
    const packageUrl = resolveUrl(version.downloads.package, hubBase);
    const packageBuffer = await fetchBuffer(packageUrl);
    const packageName = path.basename(version.downloads.package);
    const packagePath = path.join(absOutput, packageName);
    await fs.writeFile(packagePath, packageBuffer);
    const actualSha256 = sha256Buffer(packageBuffer);
    results.push({
      file: packageName,
      path: packagePath,
      size: packageBuffer.length,
      sha256: actualSha256,
      sha256Valid: version.downloads.packageSha256 ? verifySha256(actualSha256, version.downloads.packageSha256) : undefined,
    });
  }

  if (json) {
    output('json', '', { slug, version: version.version, outputDir: absOutput, files: results });
    return;
  }

  printHuman([
    `Downloaded ${data.tool.displayName} ${version.version} to ${absOutput}`,
    '',
    ...results.map(r => `  ${r.file} (${formatSize(r.size)}) -> ${r.path}`),
    '',
    ...results.filter(r => r.sha256).map(r => `  sha256 ${r.file}: ${r.sha256} (${r.sha256Valid === undefined ? 'no expected hash' : r.sha256Valid ? 'verified' : 'mismatch'})`),
    '',
    'Next: use the ZIP path and manifest path above for audit, install, or offline transfer.',
  ]);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
