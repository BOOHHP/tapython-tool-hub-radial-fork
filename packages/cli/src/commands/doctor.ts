import { parseArgs } from 'node:util';
import path from 'node:path';
import type { CommandContext } from '../lib/types.js';
import { CliError } from '../lib/types.js';
import { fetchJson } from '../lib/http.js';
import { output, printHuman } from '../lib/output.js';
import { checkFileWritable, detectTAPythonDir } from '../lib/paths.js';
import { VERSION } from '../lib/version.js';

interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
  action?: string;
}

export async function run(ctx: CommandContext): Promise<void> {
  const { values } = parseArgs({
    args: ctx.args,
    options: {
      hub: { type: 'string' },
      project: { type: 'string' },
      json: { type: 'boolean' },
    },
    allowPositionals: true,
    strict: false,
  });

  const hub = (values.hub as string) ?? '';
  if (!hub) throw new CliError('--hub is required', 'MISSING_ARG');

  const projectRoot = (values.project as string) ?? '';
  if (!projectRoot) throw new CliError('--project is required', 'MISSING_ARG');

  const json = ctx.json || Boolean(values.json);
  const absProject = path.resolve(projectRoot);
  const hubBase = hub.replace(/\/$/, '');
  const checks: DoctorCheck[] = [];

  try {
    const health = await fetchJson<Record<string, unknown>>(`${hubBase}/health`);
    checks.push({ name: 'Hub', ok: true, detail: `${hubBase} (${health.status ?? 'ok'})` });
  } catch (error) {
    checks.push({
      name: 'Hub',
      ok: false,
      detail: hubBase,
      action: error instanceof Error ? error.message : String(error),
    });
  }

  const tapython = await detectTAPythonDir(absProject);
  checks.push({
    name: 'TAPython directory',
    ok: tapython.exists,
    detail: tapython.path,
    action: tapython.exists ? undefined : 'Install TAPython or choose the correct UE project root.',
  });

  const menuConfigPath = path.join(absProject, 'TA', 'TAPython', 'UI', 'MenuConfig.json');
  const menuConfig = await checkFileWritable(menuConfigPath);
  checks.push({
    name: 'MenuConfig writable',
    ok: menuConfig.writable,
    detail: menuConfig.exists ? menuConfigPath : `${menuConfigPath} (will be created)`,
    action: menuConfig.writable ? undefined : 'Fix file permissions before install.',
  });

  checks.push({ name: 'CLI version', ok: true, detail: VERSION });

  const result = {
    ok: checks.every((check) => check.ok),
    hub: hubBase,
    project: absProject,
    cliVersion: VERSION,
    checks,
  };

  if (json) {
    output('json', '', result);
    return;
  }

  const lines = [
    `Doctor: ${absProject}`,
    '─'.repeat(50),
    ...checks.map((check) => `${check.ok ? '✓' : '✗'} ${check.name}: ${check.detail}${check.action ? `\n  Next: ${check.action}` : ''}`),
    '',
    result.ok ? 'Next: run plan or install for a specific tool.' : 'Next: fix failed checks, then run doctor again.',
  ];
  printHuman(lines);
}