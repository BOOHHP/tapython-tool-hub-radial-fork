import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readZipEntries } from '../lib/zip.js';
import { sha256Buffer } from '../lib/hash.js';

describe('zip', () => {
  it('reads entries from a generated ZIP file', async () => {
    const buffer = createStoredZip([
      { path: 'manifest.json', content: Buffer.from('{"files":[]}', 'utf8') },
      { path: 'ActorRenameTool/ActorRenameTool.py', content: Buffer.from('print("hello")\n', 'utf8') }
    ]);
    const entries = readZipEntries(buffer);

    assert.ok(entries.length > 0, 'should have at least one entry');
    const paths = entries.map(e => e.path);
    assert.ok(paths.includes('manifest.json'), 'should contain manifest.json');
  });

  it('entry content matches manifest sha256', async () => {
    const toolFile = Buffer.from('print("hello")\n', 'utf8');
    const manifest = {
      files: [
        { path: 'ActorRenameTool/ActorRenameTool.py', sha256: sha256Buffer(toolFile) }
      ]
    };
    const buffer = createStoredZip([
      { path: 'manifest.json', content: Buffer.from(JSON.stringify(manifest), 'utf8') },
      { path: 'ActorRenameTool/ActorRenameTool.py', content: toolFile }
    ]);
    const entries = readZipEntries(buffer);

    for (const file of manifest.files) {
      const entry = entries.find(e => e.path === file.path);
      assert.ok(entry, `ZIP should contain ${file.path}`);
      const hash = sha256Buffer(entry!.content);
      assert.equal(hash, file.sha256, `SHA256 mismatch for ${file.path}`);
    }
  });

  it('throws on invalid buffer', () => {
    assert.throws(() => readZipEntries(Buffer.from('not a zip')), /not a valid ZIP/);
  });
});

interface TestZipFile {
  path: string;
  content: Buffer;
}

function createStoredZip(files: TestZipFile[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.path, 'utf8');
    const crc = crc32(file.content);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(file.content.length, 18);
    localHeader.writeUInt32LE(file.content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, name, file.content);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(file.content.length, 20);
    centralHeader.writeUInt32LE(file.content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);

    offset += localHeader.length + name.length + file.content.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...localParts, centralDir, eocd]);
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
