import fs from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ApiConfig } from '../config/env.js';
import { type EventStore, idPattern } from '../identity/events.js';
import type { HubAuth } from '../identity/hubAuth.js';

const slugPattern = /^[a-z0-9][a-z0-9._-]{0,127}$/;

export interface DownloadTracking {
  store: EventStore;
  hubAuth?: HubAuth;
}

export function registerDownloadRoutes(config: ApiConfig, tracking?: DownloadTracking) {
  return async function downloadRoutes(app: FastifyInstance) {
    app.get<{ Params: { '*': string } }>('/downloads/*', async (request, reply) => {
      const relativePath = request.params['*'];
      const filePath = resolveInside(config.downloadRoot, relativePath);

      try {
        const contentType = getContentType(filePath);
        const content = isTextContent(contentType)
          ? await fs.readFile(filePath, 'utf8')
          : await fs.readFile(filePath);
        if (tracking) {
          recordDownload(request, relativePath, tracking);
        }
        return reply
          .type(contentType)
          .send(content);
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          return reply.code(404).send({ error: 'download_not_found' });
        }
        throw error;
      }
    });
  };
}

// Counting must never break a download, so failures are swallowed after logging.
function recordDownload(request: FastifyRequest, relativePath: string, tracking: DownloadTracking): void {
  if (request.method !== 'GET') {
    return;
  }
  const [slug, version, file, ...rest] = relativePath.split('/');
  if (rest.length > 0 || !file || !slug || !version || !slugPattern.test(slug)) {
    return;
  }
  const type = file === 'manifest.json' ? 'download.manifest' : file.endsWith('.zip') ? 'download.package' : undefined;
  if (!type) {
    return;
  }
  const header = request.headers['x-tapython-device'];
  const deviceId = typeof header === 'string' && idPattern.test(header) ? header : undefined;
  try {
    tracking.store.recordServerEvent({ type, slug, version, deviceId, openId: tracking.hubAuth?.resolve(request)?.user.openId });
  } catch (error) {
    request.log.warn({ err: error }, 'download event not recorded');
  }
}
function resolveInside(baseDir: string, relativePath: string): string {
  const resolvedPath = path.resolve(baseDir, relativePath);
  const resolvedBase = path.resolve(baseDir);
  if (resolvedPath !== resolvedBase && !resolvedPath.startsWith(`${resolvedBase}${path.sep}`)) {
    throw new Error(`Path escapes allowed directory: ${relativePath}`);
  }
  return resolvedPath;
}

function getContentType(filePath: string): string {
  if (filePath.endsWith('.json')) {
    return 'application/json; charset=utf-8';
  }
  if (filePath.endsWith('.md')) {
    return 'text/markdown; charset=utf-8';
  }
  if (filePath.endsWith('.txt')) {
    return 'text/plain; charset=utf-8';
  }
  if (filePath.endsWith('.py')) {
    return 'text/x-python; charset=utf-8';
  }
  if (filePath.endsWith('.zip')) {
    return 'application/zip';
  }
  return 'application/octet-stream';
}

function isTextContent(contentType: string): boolean {
  return contentType.includes('charset=utf-8');
}