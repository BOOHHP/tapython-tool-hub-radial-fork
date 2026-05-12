import fs from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export interface StaticPluginOptions {
  root: string;
  apiPrefixes?: string[];
}

const DEFAULT_API_PREFIXES = ['/api/', '/downloads/', '/health'];

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

export async function registerStaticAssets(app: FastifyInstance, options: StaticPluginOptions): Promise<void> {
  const root = path.resolve(options.root);
  const apiPrefixes = options.apiPrefixes ?? DEFAULT_API_PREFIXES;
  const indexPath = path.join(root, 'index.html');

  try {
    await fs.access(indexPath);
  } catch {
    app.log.warn({ root }, 'SERVE_STATIC enabled but index.html not found; static serving disabled');
    return;
  }

  app.setNotFoundHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    const url = request.raw.url ?? request.url;
    const pathname = url.split('?')[0] ?? '/';

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return reply.code(404).send({ error: 'not_found' });
    }

    if (apiPrefixes.some((prefix) => pathname === prefix.replace(/\/$/, '') || pathname.startsWith(prefix))) {
      return reply.code(404).send({ error: 'not_found' });
    }

    const decoded = safeDecode(pathname);
    if (decoded === null) {
      return reply.code(400).send({ error: 'bad_request' });
    }

    const fileResult = await tryServeFile(root, decoded);
    if (fileResult) {
      return reply.type(fileResult.contentType).send(fileResult.content);
    }

    const indexContent = await fs.readFile(indexPath);
    return reply.type('text/html; charset=utf-8').send(indexContent);
  });

  app.log.info({ root }, 'static asset serving enabled');
}

async function tryServeFile(
  root: string,
  pathname: string
): Promise<{ content: Buffer; contentType: string } | null> {
  const relative = pathname.replace(/^\/+/, '');
  if (!relative) {
    return null;
  }

  const candidate = path.resolve(root, relative);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
    return null;
  }

  try {
    const stat = await fs.stat(candidate);
    if (!stat.isFile()) {
      return null;
    }
  } catch {
    return null;
  }

  const ext = path.extname(candidate).toLowerCase();
  const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream';
  const content = await fs.readFile(candidate);
  return { content, contentType };
}

function safeDecode(pathname: string): string | null {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
}
