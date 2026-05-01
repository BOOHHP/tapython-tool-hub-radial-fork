import { CliError } from './types.js';

export interface ZipEntry {
  path: string;
  content: Buffer;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
}

export function readZipEntries(buffer: Buffer): ZipEntry[] {
  const eocdOffset = findEocd(buffer);
  const entryCount = buffer.readUInt16LE(eocdOffset + 8);
  const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);

  const entries: ZipEntry[] = [];
  let offset = centralDirOffset;

  for (let i = 0; i < entryCount; i++) {
    const sig = buffer.readUInt32LE(offset);
    if (sig !== 0x02014b50) {
      throw new CliError('Invalid central directory entry signature', 'ZIP_CORRUPT');
    }

    const method = buffer.readUInt16LE(offset + 10);
    if (method !== 0) {
      throw new CliError(`Unsupported compression method ${method}; only stored (0) is supported`, 'ZIP_UNSUPPORTED');
    }

    const crc32 = buffer.readUInt32LE(offset + 16);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);

    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');

    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const contentOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const content = buffer.subarray(contentOffset, contentOffset + uncompressedSize);

    entries.push({ path: name, content, crc32, compressedSize, uncompressedSize });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function findEocd(buffer: Buffer): number {
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      return i;
    }
  }
  throw new CliError('End of Central Directory not found; not a valid ZIP file', 'ZIP_CORRUPT');
}
