#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { CliError } from './lib/types.js';
import type { CommandContext } from './lib/types.js';
import { printError, printJson } from './lib/output.js';
import { run as runPing } from './commands/ping.js';
import { run as runSearch } from './commands/search.js';
import { run as runShow } from './commands/show.js';
import { run as runPlan } from './commands/plan.js';
import { run as runDownload } from './commands/download.js';
import { run as runVerify } from './commands/verify.js';
import { run as runInstall } from './commands/install.js';
import { run as runUninstall } from './commands/uninstall.js';
import { run as runDoctor } from './commands/doctor.js';
import { VERSION } from './lib/version.js';

const COMMANDS: Record<string, (ctx: CommandContext) => Promise<void>> = {
  search: runSearch,
  show: runShow,
  plan: runPlan,
  download: runDownload,
  verify: runVerify,
  install: runInstall,
  uninstall: runUninstall,
  doctor: runDoctor,
};

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);

  const { values: globalFlags, positionals } = parseArgs({
    args: rawArgs,
    options: {
      version: { type: 'boolean', short: 'v' },
      help: { type: 'boolean', short: 'h' },
      json: { type: 'boolean' },
    },
    allowPositionals: true,
    strict: false,
  });

  if (globalFlags.version && (positionals.length === 0 || positionals[0] === '--version')) {
    process.stdout.write(`tapython-tool-hub ${VERSION}\n`);
    return;
  }

  if (globalFlags.help || positionals.length === 0) {
    printUsage();
    return;
  }

  const subcommand = positionals[0];
  const json = Boolean(globalFlags.json);

  if (subcommand === 'hub') {
    const hubSub = positionals[1];
    if (hubSub === 'ping') {
      const ctx = buildContext(rawArgs.slice(rawArgs.indexOf('ping') + 1), json);
      await runPing(ctx);
      return;
    }
    throw new CliError(`Unknown hub subcommand: ${hubSub ?? '(none)'}`, 'UNKNOWN_COMMAND');
  }

  const handler = COMMANDS[subcommand];
  if (!handler) {
    throw new CliError(`Unknown command: ${subcommand}`, 'UNKNOWN_COMMAND');
  }

  const subIdx = rawArgs.indexOf(subcommand);
  const ctx = buildContext(rawArgs.slice(subIdx + 1), json);
  await handler(ctx);
}

function buildContext(args: string[], json: boolean): CommandContext {
  return {
    json,
    args,
    flags: {},
  };
}

function printUsage(): void {
  process.stdout.write(`tapython-tool-hub ${VERSION}

Usage:
  tapython-tool-hub --version
  tapython-tool-hub hub ping --hub <url>
  tapython-tool-hub search <query> --hub <url>
  tapython-tool-hub show <slug> --hub <url>
  tapython-tool-hub plan <slug> --hub <url> --project <path>
  tapython-tool-hub download <slug> --hub <url> [--version <ver>] --output <dir>
  tapython-tool-hub verify --manifest <path> --package <path>
  tapython-tool-hub doctor --hub <url> --project <path>
  tapython-tool-hub install <slug|url> --hub <url> --project <path> [--dry-run] [--report <file>] [--yes]
  tapython-tool-hub uninstall <slug> --project <path> [--yes]

Global flags:
  --json        Output structured JSON for Agent consumption
  --version     Print version
  --help        Show this help
`);
}

main().catch((error) => {
  if (error instanceof CliError) {
    const json = process.argv.includes('--json');
    if (json) {
      printJson({ error: { code: error.code, message: error.message } });
    } else {
      printError(error.message);
    }
    process.exitCode = error.exitCode;
  } else {
    printError(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
});
