import { parseArgs } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import type { CommandContext } from '../lib/types.js';
import { CliError } from '../lib/types.js';
import { output, printHuman } from '../lib/output.js';
import { readLedger, writeLedger, findInstalledTool, removeToolFromLedger } from '../lib/ledger.js';
import { readMenuConfig } from '../lib/menuConfig.js';
import { backupFile } from '../lib/backup.js';

export async function run(ctx: CommandContext): Promise<void> {
  const { values, positionals } = parseArgs({
    args: ctx.args,
    options: {
      project: { type: 'string' },
      yes: { type: 'boolean', short: 'y' },
      json: { type: 'boolean' },
    },
    allowPositionals: true,
    strict: false,
  });

  const slug = positionals[0];
  if (!slug) throw new CliError('Tool slug is required', 'MISSING_ARG');

  const projectRoot = (values.project as string) ?? '';
  if (!projectRoot) throw new CliError('--project is required', 'MISSING_ARG');

  const yes = Boolean(values.yes);
  const json = ctx.json || Boolean(values.json);
  const absProject = path.resolve(projectRoot);

  const ledger = await readLedger(absProject);
  const installed = findInstalledTool(ledger, slug);

  if (!installed) {
    throw new CliError(`Tool "${slug}" is not installed in this project (no ledger record).`, 'NOT_INSTALLED');
  }

  const filesToRemove = installed.files.map(f => ({
    path: f.path,
    absolutePath: path.join(installed.installDir, f.path),
  }));

  const menuItemsToRemove = installed.menuConfig.itemsAdded;

  if (json && !yes) {
    output('json', '', {
      action: 'uninstall',
      tool: { slug: installed.slug, displayName: installed.displayName, version: installed.version },
      filesToRemove: filesToRemove.map(f => f.path),
      menuItemsToRemove,
      installDir: installed.installDir,
    });
    return;
  }

  if (!yes) {
    printHuman([
      `Uninstall: ${installed.displayName} ${installed.version}`,
      '─'.repeat(50),
      '',
      `Install directory: ${installed.installDir}`,
      '',
      `Files to remove (${filesToRemove.length}):`,
      ...filesToRemove.map(f => `  - ${f.path}`),
      '',
      `MenuConfig items to remove (${menuItemsToRemove.length}):`,
      ...menuItemsToRemove.map(item => `  - ${item.name} → ${item.ChameleonTools}`),
    ]);

    if (!process.stdin.isTTY) {
      throw new CliError('Non-interactive terminal. Use --yes to confirm.', 'NON_INTERACTIVE');
    }
    const confirmed = await askConfirmation(`Remove ${installed.displayName} ${installed.version}?`);
    if (!confirmed) {
      printHuman('Uninstall cancelled.');
      return;
    }
  }

  for (const file of filesToRemove) {
    try {
      await fs.rm(file.absolutePath, { force: true });
    } catch { /* best effort */ }
  }

  await removeEmptyDirs(installed.installDir);

  if (menuItemsToRemove.length > 0) {
    const menuConfigPath = installed.menuConfig.target;
    try {
      await backupFile(menuConfigPath);
      const config = await readMenuConfig(menuConfigPath);
      const mountPoint = installed.menuConfig.mountPoint;
      const items = (config[mountPoint] ?? []) as Array<Record<string, string>>;
      const chameleonPaths = new Set(menuItemsToRemove.map(i => i.ChameleonTools));
      config[mountPoint] = items.filter(item => !chameleonPaths.has(item.ChameleonTools));
      await fs.writeFile(menuConfigPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
    } catch { /* MenuConfig may not exist anymore */ }
  }

  removeToolFromLedger(ledger, slug);
  await writeLedger(absProject, ledger);

  if (json) {
    output('json', '', { success: true, slug, version: installed.version, filesRemoved: filesToRemove.length, menuItemsRemoved: menuItemsToRemove.length });
    return;
  }

  printHuman([
    '',
    `✓ Uninstalled ${installed.displayName} ${installed.version}`,
    `  Files removed: ${filesToRemove.length}`,
    `  MenuConfig items removed: ${menuItemsToRemove.length}`,
  ]);
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

async function removeEmptyDirs(dirPath: string): Promise<void> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        await removeEmptyDirs(path.join(dirPath, entry.name));
      }
    }
    const remaining = await fs.readdir(dirPath);
    if (remaining.length === 0) {
      await fs.rmdir(dirPath);
    }
  } catch { /* best effort */ }
}
