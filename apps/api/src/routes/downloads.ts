import fs from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { ApiConfig } from '../config/env.js';

export function registerDownloadRoutes(config: ApiConfig) {
  return async function downloadRoutes(app: FastifyInstance) {
    app.get<{ Params: { '*': string } }>('/downloads/*', async (request, reply) => {
      const relativePath = request.params['*'];
      const filePath = resolveInside(config.downloadRoot, relativePath);

      try {
        const content = await fs.readFile(filePath);
        return reply
          .type(getContentType(filePath))
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
  if (filePath.endsWith('.md') || filePath.endsWith('.txt')) {
    return 'text/plain; charset=utf-8';
  }
  if (filePath.endsWith('.py')) {
    return 'text/x-python; charset=utf-8';
  }
  return 'application/octet-stream';
}