import { parseArgs } from 'node:util';
import type { CommandContext } from '../lib/types.js';
import { CliError } from '../lib/types.js';
import { fetchJson } from '../lib/http.js';
import { output } from '../lib/output.js';

export async function run(ctx: CommandContext): Promise<void> {
  const { values } = parseArgs({
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

  const json = ctx.json || Boolean(values.json);
  const url = `${hub.replace(/\/$/, '')}/health`;
  const data = await fetchJson<Record<string, unknown>>(url);

  output(json ? 'json' : 'human', `Hub at ${hub} is reachable. Status: ${data.status ?? 'ok'}`, data);
}
