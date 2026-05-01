import { parseArgs } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { CommandContext, InstallPlan } from '../lib/types.js';
import { CliError } from '../lib/types.js';
import { fetchJson } from '../lib/http.js';
import { output, printHuman } from '../lib/output.js';
import { expandInstallPath, detectTAPythonDir, checkFileWritable } from '../lib/paths.js';
import { readMenuConfig, planMenuConfigMerge, formatMenuConfigDiff } from '../lib/menuConfig.js';
import { resolveToolVersion } from './install.js';
import type { ToolDetailResponse } from './install.js';

export async function run(ctx: CommandContext): Promise<void> {
  const { values, positionals } = parseArgs({
    args: ctx.args,
    options: {
      hub: { type: 'string' },
      project: { type: 'string' },
      version: { type: 'string' },
      json: { type: 'boolean' },
    },
    allowPositionals: true,
    strict: false,
  });

  const hub = (values.hub as string) ?? '';
  if (!hub) throw new CliError('--hub is required', 'MISSING_ARG');

  const slug = positionals[0];
  if (!slug) throw new CliError('Tool slug is required', 'MISSING_ARG');

  const projectRoot = (values.project as string) ?? '';
  if (!projectRoot) throw new CliError('--project is required', 'MISSING_ARG');

  const json = ctx.json || Boolean(values.json);
  const requestedVersion = values.version as string | undefined;

  const url = `${hub.replace(/\/$/, '')}/api/tools/${slug}.json`;
  const data = await fetchJson<ToolDetailResponse>(url);
  const version = resolveToolVersion(data.tool, requestedVersion);

  const installDir = expandInstallPath(version.manifest.installPath, path.resolve(projectRoot));
  const tapython = await detectTAPythonDir(path.resolve(projectRoot));

  const menuConfigPath = expandInstallPath(
    version.manifest.menuConfigMerge.target,
    path.resolve(projectRoot)
  );
  const menuConfigStatus = await checkFileWritable(menuConfigPath);
  const existingMenuConfig = await readMenuConfig(menuConfigPath);
  const menuDiff = planMenuConfigMerge(
    existingMenuConfig,
    version.manifest.menuConfigMerge.itemsToAdd,
    version.manifest.menuConfigMerge.mountPoint,
    menuConfigPath
  );

  const filePlan = await Promise.all(version.manifest.files.map(async (f: { path: string }) => {
    const targetPath = path.join(installDir, f.path);
    let action: 'add' | 'overwrite' | 'skip' = 'add';
    try {
      await fs.access(targetPath);
      action = 'overwrite';
    } catch { /* file doesn't exist */ }
    return { path: f.path, action };
  }));

  const plan: InstallPlan = {
    tool: { slug: data.tool.slug, displayName: data.tool.displayName, version: version.version },
    downloads: {
      manifest: version.downloads.manifest,
      package: version.downloads.package,
      readme: version.downloads.readme,
      markdown: version.downloads.markdown,
    },
    checks: {
      hashValid: true,
      pathExists: tapython.exists,
      tapythonDirExists: tapython.exists,
      menuConfigWritable: menuConfigStatus.writable,
    },
    filePlan,
    menuConfigDiff: {
      target: menuConfigPath,
      mountPoint: version.manifest.menuConfigMerge.mountPoint,
      itemsToAdd: menuDiff.itemsToAdd,
    },
    warnings: buildWarnings(tapython.exists, menuConfigStatus, filePlan),
    nextCommand: `tapython-tool-hub install ${slug} --hub ${hub} --project "${projectRoot}" --yes`,
  };

  if (json) {
    output('json', '', plan);
    return;
  }

  const lines = [
    `Install Plan: ${plan.tool.displayName} ${plan.tool.version}`,
    '─'.repeat(50),
    '',
    'Checks:',
    `  TAPython directory: ${tapython.exists ? '✓ found' : '✗ not found'} (${tapython.path})`,
    `  MenuConfig writable: ${menuConfigStatus.writable ? '✓' : '✗'}`,
    '',
    `Install target: ${installDir}`,
    '',
    `Files (${filePlan.length}):`,
    ...filePlan.map((f) => `  ${f.action === 'add' ? '+' : '~'} ${f.path}`),
    '',
    'MenuConfig merge:',
    ...formatMenuConfigDiff(menuDiff).map(l => `  ${l}`),
  ];

  if (plan.warnings.length > 0) {
    lines.push('', 'Warnings:', ...plan.warnings.map(w => `  ⚠ ${w}`));
  }

  lines.push('', `Next: ${plan.nextCommand}`);
  printHuman(lines);
}

function buildWarnings(
  tapythonExists: boolean,
  menuConfig: { exists: boolean; writable: boolean },
  filePlan: Array<{ action: string }>
): string[] {
  const warnings: string[] = [];
  if (!tapythonExists) warnings.push('TAPython directory not found in project. Files will be created but TAPython may not be set up.');
  if (menuConfig.exists && !menuConfig.writable) warnings.push('MenuConfig.json exists but is not writable.');
  const overwrites = filePlan.filter(f => f.action === 'overwrite').length;
  if (overwrites > 0) warnings.push(`${overwrites} file(s) will be overwritten.`);
  return warnings;
}
