import crypto from 'node:crypto';
import fs from 'node:fs/promises';

export function sha256Buffer(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export async function sha256File(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath);
  return sha256Buffer(content);
}

export function verifySha256(actual: string, expected: string): boolean {
  if (actual.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}
