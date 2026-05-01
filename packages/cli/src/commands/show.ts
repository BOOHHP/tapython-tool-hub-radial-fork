import { parseArgs } from 'node:util';
import type { CommandContext } from '../lib/types.js';
import { CliError } from '../lib/types.js';
import { fetchJson } from '../lib/http.js';
import { output, printHuman } from '../lib/output.js';

interface ToolDetail {
  tool: {
    slug: string;
    displayName: string;
    description: string;
    category: string;
    author: string;
    ownerTeam: string;
    riskLevel: string;
    status: string;
    mountPoint: string;
    installPath: string;
    entryJson: string;
    compatibility: { unrealEngine: string[]; tapython: string[]; plugins: string[] };
    tags: string[];
    versions: Array<{
      version: string;
      releasedAt: string;
      changeSummary: string;
      downloads: { manifest: string; package: string; readme: string; markdown?: string; packageSha256?: string; packageSize?: number };
    }>;
    downloads: { latestManifest: string; latestPackage: string; latestReadme: string; latestMarkdown?: string; latestPackageSha256?: string; latestPackageSize?: number };
    summary: { features: string[]; unrealApis: string[]; riskNotes: string[] };
  };
}

export async function run(ctx: CommandContext): Promise<void> {
  const { values, positionals } = parseArgs({
    args: ctx.args,
    options: {
      hub: { type: 'string' },
      json: { type: 'boolean' },
    },
    allowPositionals: true,
    strict: false,
  });

  const hub = (values.hub as string) ?? '';
  if (!hub) throw new CliError('--hub is required', 'MISSING_ARG');

  const slug = positionals[0];
  if (!slug) throw new CliError('Tool slug is required', 'MISSING_ARG');

  const json = ctx.json || Boolean(values.json);
  const url = `${hub.replace(/\/$/, '')}/api/tools/${slug}.json`;
  const data = await fetchJson<ToolDetail>(url);
  const tool = data.tool;

  if (json) {
    output('json', '', data);
    return;
  }

  const latest = tool.versions[0];
  const lines = [
    `${tool.displayName} (${tool.slug})`,
    `${'─'.repeat(40)}`,
    `Version:      ${latest?.version ?? 'N/A'}`,
    `Status:       ${tool.status}`,
    `Category:     ${tool.category}`,
    `Risk:         ${tool.riskLevel}`,
    `Author:       ${tool.author} (${tool.ownerTeam})`,
    `Install Path: ${tool.installPath}`,
    `Mount Point:  ${tool.mountPoint}`,
    `Entry JSON:   ${tool.entryJson}`,
    `UE Versions:  ${tool.compatibility.unrealEngine.join(', ')}`,
    `TAPython:     ${tool.compatibility.tapython.join(', ')}`,
    `Tags:         ${tool.tags.join(', ')}`,
    '',
    `Description:  ${tool.description}`,
    '',
    'Features:',
    ...tool.summary.features.map((f) => `  • ${f}`),
  ];

  if (latest) {
    lines.push('', 'Downloads:', `  Manifest: ${hub}${latest.downloads.manifest}`, `  Package:  ${latest.downloads.package ? hub + latest.downloads.package : '(unavailable)'}`);
    if (latest.downloads.packageSha256) {
      lines.push(`  SHA256:   ${latest.downloads.packageSha256}`);
    }
  }

  if (tool.versions.length > 1) {
    lines.push('', `Versions (${tool.versions.length}):`);
    for (const v of tool.versions) {
      lines.push(`  ${v.version} (${v.releasedAt}) - ${v.changeSummary}`);
    }
  }

  printHuman(lines);
}
