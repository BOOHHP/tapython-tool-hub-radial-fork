import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { readLedger, writeLedger, addToolToLedger, findInstalledTool, removeToolFromLedger } from '../lib/ledger.js';
import type { InstalledToolRecord, InstallLedger } from '../lib/ledger.js';

describe('ledger', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ledger-test-'));
    await fs.mkdir(path.join(tmpDir, 'TA', 'TAPython'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('readLedger returns empty ledger when file does not exist', async () => {
    const ledger = await readLedger(tmpDir);
    assert.equal(ledger.schemaVersion, '1.0.0');
    assert.equal(ledger.tools.length, 0);
  });

  it('writeLedger creates file and readLedger reads it back', async () => {
    const ledger: InstallLedger = { schemaVersion: '1.0.0', tools: [] };
    await writeLedger(tmpDir, ledger);
    const read = await readLedger(tmpDir);
    assert.deepEqual(read, ledger);
  });

  it('addToolToLedger adds a new tool', () => {
    const ledger: InstallLedger = { schemaVersion: '1.0.0', tools: [] };
    const record: InstalledToolRecord = {
      slug: 'test-tool',
      displayName: 'Test Tool',
      version: '1.0.0',
      installedAt: '2026-01-01T00:00:00Z',
      installDir: '/tmp/install',
      files: [],
      menuConfig: { target: '/tmp/MenuConfig.json', mountPoint: 'OnToolBarChameleon', itemsAdded: [] },
    };
    addToolToLedger(ledger, record);
    assert.equal(ledger.tools.length, 1);
    assert.equal(ledger.tools[0].slug, 'test-tool');
  });

  it('addToolToLedger replaces existing tool by slug', () => {
    const ledger: InstallLedger = { schemaVersion: '1.0.0', tools: [] };
    const v1: InstalledToolRecord = {
      slug: 'test-tool', displayName: 'Test', version: '1.0.0',
      installedAt: '2026-01-01T00:00:00Z', installDir: '/tmp/install',
      files: [], menuConfig: { target: '/tmp/M.json', mountPoint: 'X', itemsAdded: [] },
    };
    const v2 = { ...v1, version: '2.0.0' };
    addToolToLedger(ledger, v1);
    addToolToLedger(ledger, v2);
    assert.equal(ledger.tools.length, 1);
    assert.equal(ledger.tools[0].version, '2.0.0');
  });

  it('findInstalledTool finds by slug', () => {
    const ledger: InstallLedger = { schemaVersion: '1.0.0', tools: [{
      slug: 'my-tool', displayName: 'My Tool', version: '1.0.0',
      installedAt: '2026-01-01T00:00:00Z', installDir: '/tmp',
      files: [], menuConfig: { target: '/t', mountPoint: 'X', itemsAdded: [] },
    }] };
    assert.ok(findInstalledTool(ledger, 'my-tool'));
    assert.equal(findInstalledTool(ledger, 'other'), undefined);
  });

  it('removeToolFromLedger removes and returns the tool', () => {
    const ledger: InstallLedger = { schemaVersion: '1.0.0', tools: [{
      slug: 'rm-tool', displayName: 'RM', version: '1.0.0',
      installedAt: '2026-01-01T00:00:00Z', installDir: '/tmp',
      files: [], menuConfig: { target: '/t', mountPoint: 'X', itemsAdded: [] },
    }] };
    const removed = removeToolFromLedger(ledger, 'rm-tool');
    assert.equal(removed?.slug, 'rm-tool');
    assert.equal(ledger.tools.length, 0);
  });
});
