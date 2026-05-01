import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ApiConfig {
  databaseUrl?: string;
  host: string;
  port: number;
  repoRoot: string;
  toolApiRoot: string;
}

export function loadConfig(): ApiConfig {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

  return {
    databaseUrl: process.env.DATABASE_URL,
    host: process.env.API_HOST ?? '127.0.0.1',
    port: Number(process.env.API_PORT ?? 8787),
    repoRoot,
    toolApiRoot: process.env.TOOL_API_ROOT ?? path.join(repoRoot, 'apps', 'web', 'public', 'api', 'tools')
  };
}