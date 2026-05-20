import path from 'node:path';
import fs from 'node:fs';
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
  serveStatic: boolean;
  webStaticRoot: string;
  adminUsername?: string;
  adminPasswordHash?: string;
  authSessionSecret?: string;
  adminSessionTtlHours?: number;
}

export function loadConfig(): ApiConfig {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
  loadDotEnv(path.join(repoRoot, '.env'));

  return {
    databaseUrl: process.env.DATABASE_URL,
    host: process.env.API_HOST ?? '127.0.0.1',
    port: Number(process.env.API_PORT ?? 8787),
    repoRoot,
    toolDataRoot: process.env.TOOL_DATA_ROOT ?? path.join(repoRoot, 'data', 'tools'),
    toolDocsRoot: process.env.TOOL_DOCS_ROOT ?? path.join(repoRoot, 'data', 'tool-docs'),
    toolApiRoot: process.env.TOOL_API_ROOT ?? path.join(repoRoot, 'apps', 'web', 'public', 'api', 'tools'),
    downloadRoot: process.env.TOOL_DOWNLOAD_ROOT ?? path.join(repoRoot, 'apps', 'web', 'public', 'downloads'),
    submissionRoot: process.env.SUBMISSION_ROOT ?? path.join(repoRoot, '.tapython-tool-hub', 'submissions'),
    serveStatic: parseBoolean(process.env.SERVE_STATIC, true),
    webStaticRoot: process.env.WEB_STATIC_ROOT ?? path.join(repoRoot, 'dist'),
    adminUsername: process.env.ADMIN_USERNAME,
    adminPasswordHash: process.env.ADMIN_PASSWORD_HASH,
    authSessionSecret: process.env.AUTH_SESSION_SECRET,
    adminSessionTtlHours: Number(process.env.ADMIN_SESSION_TTL_HOURS ?? 12)
  };
}

function loadDotEnv(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex < 1) {
      continue;
    }
    const key = trimmed.slice(0, equalsIndex).trim();
    if (process.env[key] !== undefined) {
      continue;
    }
    process.env[key] = normalizeEnvValue(trimmed.slice(equalsIndex + 1).trim());
  }
}

function normalizeEnvValue(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off', ''].includes(normalized)) {
    return false;
  }
  return fallback;
}