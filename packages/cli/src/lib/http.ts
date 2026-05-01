import http from 'node:http';
import https from 'node:https';
import { CliError } from './types.js';

function getTransport(protocol: string): typeof http | typeof https {
  return protocol === 'https:' ? https : http;
}

async function request(url: string, maxRedirects = 5): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  let currentUrl = url;
  let redirects = 0;

  while (redirects <= maxRedirects) {
    const parsed = new URL(currentUrl);
    const transport = getTransport(parsed.protocol);

    const result = await new Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
      const req = transport.get(currentUrl, { timeout: 30000 }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks)
          });
        });
        res.on('error', reject);
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new CliError(`Request timed out: ${currentUrl}`, 'TIMEOUT'));
      });
    });

    if ([301, 302, 307, 308].includes(result.statusCode) && result.headers.location) {
      currentUrl = new URL(result.headers.location, currentUrl).href;
      redirects++;
      continue;
    }

    return result;
  }

  throw new CliError(`Too many redirects for ${url}`, 'TOO_MANY_REDIRECTS');
}

export async function fetchJson<T>(url: string): Promise<T> {
  const { statusCode, body } = await request(url);
  if (statusCode < 200 || statusCode >= 300) {
    throw new CliError(`HTTP ${statusCode} from ${url}`, 'HTTP_ERROR');
  }
  try {
    return JSON.parse(body.toString('utf8')) as T;
  } catch {
    throw new CliError(`Invalid JSON response from ${url}`, 'INVALID_JSON');
  }
}

export async function fetchBuffer(url: string): Promise<Buffer> {
  const { statusCode, body } = await request(url);
  if (statusCode < 200 || statusCode >= 300) {
    throw new CliError(`HTTP ${statusCode} from ${url}`, 'HTTP_ERROR');
  }
  return body;
}

export function validateHubDomain(downloadUrl: string, hubBaseUrl: string): void {
  const download = new URL(downloadUrl, hubBaseUrl);
  const hub = new URL(hubBaseUrl);
  if (download.hostname !== hub.hostname) {
    throw new CliError(
      `Download URL ${download.href} is on a different domain than hub ${hub.hostname}. Use --allow-remote-package to override.`,
      'CROSS_DOMAIN_DOWNLOAD'
    );
  }
}

export function resolveUrl(relativePath: string, hubBaseUrl: string): string {
  if (/^https?:\/\//.test(relativePath)) return relativePath;
  return new URL(relativePath, hubBaseUrl).href;
}
