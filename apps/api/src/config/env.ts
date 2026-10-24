import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface ApiConfig {
  databaseUrl?: string;
  sqlitePath?: string;
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
  feishuAuthEnabled?: boolean;
  feishuProvider?: string;
  feishuAppId?: string;
  feishuAppSecret?: string;
  feishuScope?: string;
  feishuFetchDepartment?: boolean;
  bootstrapAdminEmails?: string[];
  publicBaseUrl?: string;
  eventsEnabled?: boolean;
  notifyEnabled?: boolean;
  notifyProvider?: string;
  storeBackend?: string;
  artifactRoot?: string;
  // Stable sourceDocument prefix for published tools, whatever directory the docs physically live in.
  logicalDocsPath?: string;
}

export function resolveDataRoots(repoRoot: string, env: NodeJS.ProcessEnv) {
  // "off" lets the deploy script force repo-relative paths for one run without editing .env.
  const artifactRoot = env.ARTIFACT_ROOT && env.ARTIFACT_ROOT !== 'off' ? path.resolve(env.ARTIFACT_ROOT) : undefined;
  const base = (artifactSegments: string[], repoSegments: string[]) => (artifactRoot ? path.join(artifactRoot, ...artifactSegments) : path.join(repoRoot, ...repoSegments));
  return {
    artifactRoot,
    logicalDocsPath: artifactRoot ? 'data/tool-docs' : undefined,
    toolDataRoot: env.TOOL_DATA_ROOT ?? base(['tools'], ['data', 'tools']),
    toolDocsRoot: env.TOOL_DOCS_ROOT ?? base(['tool-docs'], ['data', 'tool-docs']),
    toolApiRoot: env.TOOL_API_ROOT ?? base(['api', 'tools'], ['apps', 'web', 'public', 'api', 'tools']),
    downloadRoot: env.TOOL_DOWNLOAD_ROOT ?? base(['downloads'], ['apps', 'web', 'public', 'downloads'])
  };
}

export function loadConfig(): ApiConfig {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
  loadDotEnv(path.join(repoRoot, '.env'));

  return {
    databaseUrl: process.env.DATABASE_URL,
    sqlitePath: process.env.SQLITE_PATH,
    host: process.env.API_HOST ?? '127.0.0.1',
    port: Number(process.env.API_PORT ?? 8787),
    repoRoot,
    ...resolveDataRoots(repoRoot, process.env),
    submissionRoot: process.env.SUBMISSION_ROOT ?? path.join(repoRoot, '.tapython-tool-hub', 'submissions'),
    serveStatic: parseBoolean(process.env.SERVE_STATIC, true),
    webStaticRoot: process.env.WEB_STATIC_ROOT ?? path.join(repoRoot, 'dist'),
    adminUsername: process.env.ADMIN_USERNAME,
    adminPasswordHash: process.env.ADMIN_PASSWORD_HASH,
    authSessionSecret: process.env.AUTH_SESSION_SECRET,
    adminSessionTtlHours: Number(process.env.ADMIN_SESSION_TTL_HOURS ?? 12),
    feishuAuthEnabled: parseBoolean(process.env.AUTH_FEISHU_ENABLED, false),
    feishuProvider: process.env.FEISHU_PROVIDER || undefined,
    feishuAppId: process.env.FEISHU_APP_ID || undefined,
    feishuAppSecret: process.env.FEISHU_APP_SECRET || undefined,
    feishuScope: process.env.FEISHU_SCOPE || undefined,
    feishuFetchDepartment: parseBoolean(process.env.FEISHU_FETCH_DEPARTMENT, false),
    bootstrapAdminEmails: (process.env.BOOTSTRAP_ADMIN_EMAILS ?? '').split(',').map((email) => email.trim()).filter(Boolean),
    publicBaseUrl: process.env.PUBLIC_BASE_URL || undefined,
    eventsEnabled: parseBoolean(process.env.EVENTS_ENABLED, false),
    notifyEnabled: parseBoolean(process.env.NOTIFY_ENABLED, false),
    notifyProvider: process.env.NOTIFY_PROVIDER || undefined,
    storeBackend: process.env.STORE_BACKEND || undefined
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