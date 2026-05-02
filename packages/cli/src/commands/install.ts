import { parseArgs } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import type { CommandContext, InstallPlan, FilePlanEntry } from '../lib/types.js';
import { CliError } from '../lib/types.js';
import { fetchJson, fetchBuffer, resolveUrl, validateHubDomain } from '../lib/http.js';
import { sha256Buffer, verifySha256 } from '../lib/hash.js';
import { readZipEntries } from '../lib/zip.js';
import { output, printHuman } from '../lib/output.js';
import { expandInstallPath, resolveInside, detectTAPythonDir, checkFileWritable } from '../lib/paths.js';
import { readMenuConfig, planMenuConfigMerge, applyMenuConfigMerge, formatMenuConfigDiff } from '../lib/menuConfig.js';
import { readLedger, writeLedger, addToolToLedger, findInstalledTool } from '../lib/ledger.js';
import type { InstalledFile } from '../lib/ledger.js';
import { backupFile } from '../lib/backup.js';

export interface ToolDetailResponse {
  tool: {
    slug: string;
    displayName: string;
    versions: Array<{
      version: string;
      releasedAt: string;
      changeSummary: string;
      breaking: boolean;
      downloads: {
        manifest: string;
        package: string;
        readme: string;
        markdown?: string;
        packageSha256?: string;
        packageSize?: number;
      };
      manifest: {
        installPath: string;
        files: Array<{ path: string; sha256: string; size: number }>;
        menuConfigMerge: {
          target: string;
          mountPoint: string;
          itemsToAdd: Array<{ name: string; ChameleonTools: string; ExtensionHookName: string }>;
        };
        postInstallSteps: string[];
      };
    }>;
  };
}

export function resolveToolVersion(
  tool: ToolDetailResponse['tool'],
  requestedVersion?: string
): ToolDetailResponse['tool']['versions'][0] {
  if (requestedVersion) {
    const found = tool.versions.find(v => v.version === requestedVersion);
    if (!found) throw new CliError(`Version ${requestedVersion} not found for ${tool.slug}`, 'VERSION_NOT_FOUND');
    return found;
  }
  if (tool.versions.length === 0) throw new CliError(`No versions available for ${tool.slug}`, 'NO_VERSIONS');
  return tool.versions[0];
}

export async function run(ctx: CommandContext): Promise<void> {
  const { values, positionals } = parseArgs({
    args: ctx.args,
    options: {
      hub: { type: 'string' },
      project: { type: 'string' },
      version: { type: 'string' },
      'dry-run': { type: 'boolean' },
      report: { type: 'string' },
      yes: { type: 'boolean', short: 'y' },
      json: { type: 'boolean' },
      'allow-remote-package': { type: 'boolean' },
    },
    allowPositionals: true,
    strict: false,
  });

  const target = positionals[0];
  if (!target) throw new CliError('Tool slug or manifest URL is required', 'MISSING_ARG');

  const projectRoot = (values.project as string) ?? '';
  if (!projectRoot) throw new CliError('--project is required', 'MISSING_ARG');

  const dryRun = Boolean(values['dry-run']);
  const yes = Boolean(values.yes);
  const json = ctx.json || Boolean(values.json);
  const allowRemote = Boolean(values['allow-remote-package']);
  const requestedVersion = values.version as string | undefined;
  const reportPath = values.report as string | undefined;

  const isUrl = /^https?:\/\//.test(target);
  let hub = ((values.hub as string) ?? '').replace(/\/$/, '');
  let manifest: ToolDetailResponse['tool']['versions'][0]['manifest'];
  let downloads: ToolDetailResponse['tool']['versions'][0]['downloads'];
  let toolMeta: { slug: string; displayName: string; version: string };

  if (isUrl) {
    const manifestData = await fetchJson<Record<string, unknown>>(target);
    manifest = manifestData as unknown as typeof manifest;
    const urlParts = target.match(/\/downloads\/([^/]+)\/([^/]+)\//);
    const slug = urlParts?.[1] ?? 'unknown';
    const version = urlParts?.[2] ?? (manifest as unknown as { version: string }).version ?? 'unknown';
    toolMeta = { slug, displayName: (manifest as unknown as { displayName: string }).displayName ?? slug, version };
    const baseUrl = target.replace(/\/downloads\/.*$/, '');
    hub = hub || baseUrl;
    downloads = {
      manifest: target,
      package: target.replace('manifest.json', `${slug}-${version}.zip`),
      readme: target.replace('manifest.json', 'README.md'),
    };
  } else {
    if (!hub) throw new CliError('--hub is required when installing by slug', 'MISSING_ARG');
    const url = `${hub}/api/tools/${target}.json`;
    const data = await fetchJson<ToolDetailResponse>(url);
    const version = resolveToolVersion(data.tool, requestedVersion);
    manifest = version.manifest;
    downloads = version.downloads;
    toolMeta = { slug: data.tool.slug, displayName: data.tool.displayName, version: version.version };
  }

  if (!allowRemote && downloads.package) {
    validateHubDomain(resolveUrl(downloads.package, hub), hub);
  }

  const absProject = path.resolve(projectRoot);
  const installDir = expandInstallPath(manifest.installPath, absProject);
  const tapython = await detectTAPythonDir(absProject);
  const menuConfigPath = expandInstallPath(manifest.menuConfigMerge.target, absProject);
  const menuConfigStatus = await checkFileWritable(menuConfigPath);
  const existingMenuConfig = await readMenuConfig(menuConfigPath);
  const menuDiff = planMenuConfigMerge(
    existingMenuConfig,
    manifest.menuConfigMerge.itemsToAdd,
    manifest.menuConfigMerge.mountPoint,
    menuConfigPath
  );

  let packageBuffer: Buffer | null = null;
  let hashValid = false;

  if (downloads.package) {
    const packageUrl = resolveUrl(downloads.package, hub);
    packageBuffer = await fetchBuffer(packageUrl);
    if (downloads.packageSha256) {
      const actual = sha256Buffer(packageBuffer);
      hashValid = verifySha256(actual, downloads.packageSha256);
      if (!hashValid && !dryRun) {
        throw new CliError(`Package SHA256 mismatch. Expected: ${downloads.packageSha256}, Got: ${actual}`, 'HASH_MISMATCH');
      }
    } else {
      hashValid = true;
    }
  }

  const filePlan: FilePlanEntry[] = [];
  for (const file of manifest.files) {
    const targetPath = path.join(installDir, file.path);
    let action: 'add' | 'overwrite' | 'skip' = 'add';
    try {
      await fs.access(targetPath);
      action = 'overwrite';
    } catch { /* new file */ }
    filePlan.push({ path: file.path, action });
  }

  const warnings = buildWarnings(tapython.exists, menuConfigStatus, filePlan, hashValid, downloads);

  const ledger = await readLedger(absProject);
  const existingInstall = findInstalledTool(ledger, toolMeta.slug);
  if (existingInstall && existingInstall.version !== toolMeta.version) {
    warnings.push(`Upgrading from ${existingInstall.version} → ${toolMeta.version}.`);
  } else if (existingInstall && existingInstall.version === toolMeta.version) {
    warnings.push(`Reinstalling same version ${toolMeta.version}.`);
  }

  const plan: InstallPlan = {
    tool: toolMeta,
    downloads: { manifest: downloads.manifest, package: downloads.package, readme: downloads.readme, markdown: downloads.markdown },
    checks: { hashValid, pathExists: tapython.exists, tapythonDirExists: tapython.exists, menuConfigWritable: menuConfigStatus.writable },
    filePlan,
    menuConfigDiff: { target: menuConfigPath, mountPoint: manifest.menuConfigMerge.mountPoint, itemsToAdd: menuDiff.itemsToAdd },
    warnings,
    nextCommand: `tapython-tool-hub install ${toolMeta.slug} --hub ${hub} --project "${projectRoot}" --yes`,
    nextHumanStep: dryRun ? 'Save or review this dry-run plan; run the install command only after confirming file overwrites and MenuConfig changes.' : 'Confirm the prompt to write files, or rerun with --dry-run before changing the project.',
  };

  if (dryRun) {
    if (reportPath) {
      await writeReport(reportPath, plan);
    }
    if (json) {
      output('json', '', plan);
    } else {
      printInstallPlan(plan, installDir);
      if (reportPath) printHuman(`Report written: ${path.resolve(reportPath)}`);
    }
    return;
  }

  if (json) {
    output('json', '', plan);
  } else {
    printInstallPlan(plan, installDir);
  }

  if (!yes) {
    if (!process.stdin.isTTY) {
      throw new CliError('Non-interactive terminal detected. Use --yes to confirm or --dry-run to preview.', 'NON_INTERACTIVE');
    }
    const confirmed = await askConfirmation(`Write ${filePlan.length} file(s) to ${installDir}?`);
    if (!confirmed) {
      printHuman('Installation cancelled.');
      return;
    }
  }

  if (!packageBuffer) {
    throw new CliError('No package available for installation', 'NO_PACKAGE');
  }

  const entries = readZipEntries(packageBuffer);
  let menuConfigBackupPath: string | null = null;
  const writtenFiles: Array<{ targetPath: string; backup: string | null }> = [];

  for (const file of manifest.files) {
    const entry = entries.find(e => e.path === file.path);
    if (!entry) throw new CliError(`File ${file.path} not found in package`, 'FILE_MISSING');
    const actual = sha256Buffer(entry.content);
    if (!verifySha256(actual, file.sha256)) {
      throw new CliError(`SHA256 mismatch for ${file.path}`, 'FILE_HASH_MISMATCH');
    }
  }

  try {
    for (const file of manifest.files) {
      const entry = entries.find(e => e.path === file.path)!;
      const targetPath = resolveInside(installDir, file.path);
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      const planEntry = filePlan.find(p => p.path === file.path)!;
      let backup: string | null = null;
      if (planEntry.action === 'overwrite') {
        backup = await backupFile(targetPath);
        if (backup) planEntry.backup = backup;
      }
      await fs.writeFile(targetPath, entry.content);
      writtenFiles.push({ targetPath, backup });
    }

    if (menuDiff.itemsToAdd.length > 0) {
      const menuBackup = await backupFile(menuConfigPath);
      await applyMenuConfigMerge(menuConfigPath, menuDiff);
      menuConfigBackupPath = menuBackup;
    }
  } catch (error) {
    await rollback(writtenFiles);
    throw error instanceof CliError ? error : new CliError(`Install failed, rolled back: ${(error as Error).message}`, 'INSTALL_FAILED');
  }

  const installedFiles: InstalledFile[] = filePlan.map(p => {
    const fileEntry = manifest.files.find((f: { path: string; sha256: string }) => f.path === p.path)!;
    return { path: p.path, sha256: fileEntry.sha256, backup: p.backup };
  });

  addToolToLedger(ledger, {
    slug: toolMeta.slug,
    displayName: toolMeta.displayName,
    version: toolMeta.version,
    installedAt: new Date().toISOString(),
    installDir,
    files: installedFiles,
    menuConfig: {
      target: menuConfigPath,
      mountPoint: manifest.menuConfigMerge.mountPoint,
      itemsAdded: menuDiff.itemsToAdd,
      backup: menuConfigBackupPath ?? undefined,
    },
    hub: hub || undefined,
  });
  await writeLedger(absProject, ledger);

  if (!json) {
    printHuman([
      '',
      `✓ Installed ${toolMeta.displayName} ${toolMeta.version} to ${installDir}`,
      `  Files written: ${filePlan.length}`,
      `  MenuConfig items added: ${menuDiff.itemsToAdd.length}`,
      ...(manifest.postInstallSteps.length > 0 ? ['', 'Post-install steps:', ...manifest.postInstallSteps.map((s, i) => `  ${i + 1}. ${s}`)] : []),
    ]);
  }
}

function printInstallPlan(plan: InstallPlan, installDir: string): void {
  const lines = [
    `Install Plan: ${plan.tool.displayName} ${plan.tool.version}`,
    '─'.repeat(50),
    '',
    'Checks:',
    `  TAPython directory: ${plan.checks.tapythonDirExists ? '✓' : '✗'}`,
    `  Package hash valid: ${plan.checks.hashValid ? '✓' : '✗'}`,
    `  MenuConfig writable: ${plan.checks.menuConfigWritable ? '✓' : '✗'}`,
    '',
    `Install target: ${installDir}`,
    '',
    `Files (${plan.filePlan.length}):`,
    ...plan.filePlan.map(f => `  ${f.action === 'add' ? '+' : '~'} ${f.path}`),
    '',
    'MenuConfig merge:',
    `  Mount point: ${plan.menuConfigDiff.mountPoint}`,
    `  Items to add: ${(plan.menuConfigDiff.itemsToAdd as unknown[]).length}`,
    '',
    `Next: ${plan.nextHumanStep}`,
  ];

  if (plan.warnings.length > 0) {
    lines.push('', 'Warnings:', ...plan.warnings.map(w => `  ⚠ ${w}`));
  }

  printHuman(lines);
}

async function writeReport(reportPath: string, plan: InstallPlan): Promise<void> {
  const absoluteReportPath = path.resolve(reportPath);
  await fs.mkdir(path.dirname(absoluteReportPath), { recursive: true });
  await fs.writeFile(absoluteReportPath, JSON.stringify(plan, null, 2) + '\n', 'utf8');
}

function buildWarnings(
  tapythonExists: boolean,
  menuConfig: { exists: boolean; writable: boolean },
  filePlan: FilePlanEntry[],
  hashValid: boolean,
  downloads: { package: string; packageSha256?: string }
): string[] {
  const warnings: string[] = [];
  if (!tapythonExists) warnings.push('TAPython directory not found. Files will be created but TAPython may not be configured.');
  if (menuConfig.exists && !menuConfig.writable) warnings.push('MenuConfig.json is not writable.');
  const overwrites = filePlan.filter(f => f.action === 'overwrite').length;
  if (overwrites > 0) warnings.push(`${overwrites} file(s) will be overwritten (backups will be created).`);
  if (!hashValid && downloads.packageSha256) warnings.push('Package hash verification failed!');
  if (!downloads.package) warnings.push('No package ZIP available for this version.');
  return warnings;
}

async function askConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function rollback(writtenFiles: Array<{ targetPath: string; backup: string | null }>): Promise<void> {
  for (const { targetPath, backup } of writtenFiles.reverse()) {
    try {
      if (backup) {
        await fs.copyFile(backup, targetPath);
        await fs.rm(backup);
      } else {
        await fs.rm(targetPath, { force: true });
      }
    } catch { /* best effort */ }
  }
}
