import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ApiConfig {
  databaseUrl?: string;
  host: string;
  port: number;
  repoRoot: string;
  toolDataRoot: string;
  toolDocsRoot: string;
  toolApiRoot: string;
  downloadRoot: string;
  submissionRoot: string;
}

export function loadConfig(): ApiConfig {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

  return {
    databaseUrl: process.env.DATABASE_URL,
    host: process.env.API_HOST ?? '127.0.0.1',
    port: Number(process.env.API_PORT ?? 8787),
    repoRoot,
    toolDataRoot: process.env.TOOL_DATA_ROOT ?? path.join(repoRoot, 'data', 'tools'),
    toolDocsRoot: process.env.TOOL_DOCS_ROOT ?? path.join(repoRoot, 'data', 'tool-docs'),
    toolApiRoot: process.env.TOOL_API_ROOT ?? path.join(repoRoot, 'apps', 'web', 'public', 'api', 'tools'),
    downloadRoot: process.env.TOOL_DOWNLOAD_ROOT ?? path.join(repoRoot, 'apps', 'web', 'public', 'downloads'),
    submissionRoot: process.env.SUBMISSION_ROOT ?? path.join(repoRoot, '.tapython-tool-hub', 'submissions')
  };
}