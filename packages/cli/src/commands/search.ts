import { parseArgs } from 'node:util';
import type { CommandContext } from '../lib/types.js';
import { CliError } from '../lib/types.js';
import { fetchJson } from '../lib/http.js';
import { output, printTable } from '../lib/output.js';

interface ToolIndex {
  tools: Array<{
    slug: string;
    displayName: string;
    latestVersion: string;
    category: string;
    riskLevel: string;
    toolType?: string;
    description: string;
    tags: string[];
    author: string;
  }>;
}

export async function run(ctx: CommandContext): Promise<void> {
  const { values, positionals } = parseArgs({
    args: ctx.args,
    options: {
      hub: { type: 'string' },
      json: { type: 'boolean' },
      type: { type: 'string' },
    },
    allowPositionals: true,
    strict: false,
  });

  const hub = (values.hub as string) ?? '';
  if (!hub) throw new CliError('--hub is required', 'MISSING_ARG');

  const query = positionals[0] ?? '';
  const json = ctx.json || Boolean(values.json);
  const typeFilter = (values.type as string)?.toLowerCase();

  const url = `${hub.replace(/\/$/, '')}/api/tools/index.json`;
  const data = await fetchJson<ToolIndex>(url);

  const queryLower = query.toLowerCase();
  let results = query
    ? data.tools.filter((t) =>
        t.slug.toLowerCase().includes(queryLower) ||
        t.displayName.toLowerCase().includes(queryLower) ||
        t.description.toLowerCase().includes(queryLower) ||
        t.category.toLowerCase().includes(queryLower) ||
        t.tags.some((tag) => tag.toLowerCase().includes(queryLower)) ||
        t.author.toLowerCase().includes(queryLower)
      )
    : data.tools;

  if (typeFilter) {
    if (typeFilter !== 'chameleon' && typeFilter !== 'python-script') {
      throw new CliError('--type must be "chameleon" or "python-script"', 'INVALID_ARG');
    }
    results = results.filter((t) => (t.toolType ?? 'chameleon') === typeFilter);
  }

  if (json) {
    output('json', '', { query, total: results.length, results });
    return;
  }

  if (results.length === 0) {
    output('human', `No tools found matching "${query}".`, null);
    return;
  }

  printTable(
    ['Slug', 'Name', 'Version', 'Type', 'Category', 'Risk'],
    results.map((t) => [t.slug, t.displayName, t.latestVersion, t.toolType ?? 'chameleon', t.category, t.riskLevel])
  );
}
