import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { applyMenuConfigMerge, planMenuConfigMerge, removeMenuConfigItems } from '../lib/menuConfig.js';

describe('menuConfig', () => {
  it('adds new items to empty config', () => {
    const existing = { OnToolBarChameleon: [] };
    const items = [{ name: 'Tool A', ChameleonTools: '../Python/ToolA/ToolA.json', ExtensionHookName: 'OnToolBarChameleon' }];
    const diff = planMenuConfigMerge(existing, items, 'OnToolBarChameleon', '/path/MenuConfig.json');

    assert.equal(diff.itemsToAdd.length, 1);
    assert.equal(diff.itemsSkipped.length, 0);
    assert.equal(diff.itemsToAdd[0].name, 'Tool A');
  });

  it('skips duplicate items', () => {
    const existing = {
      OnToolBarChameleon: [
        { name: 'Tool A', ChameleonTools: '../Python/ToolA/ToolA.json', ExtensionHookName: 'OnToolBarChameleon' }
      ]
    };
    const items = [{ name: 'Tool A', ChameleonTools: '../Python/ToolA/ToolA.json', ExtensionHookName: 'OnToolBarChameleon' }];
    const diff = planMenuConfigMerge(existing, items, 'OnToolBarChameleon', '/path/MenuConfig.json');

    assert.equal(diff.itemsToAdd.length, 0);
    assert.equal(diff.itemsSkipped.length, 1);
  });

  it('handles missing mount point key', () => {
    const existing = {};
    const items = [{ name: 'Tool B', ChameleonTools: '../Python/ToolB/ToolB.json', ExtensionHookName: 'OnToolBarChameleon' }];
    const diff = planMenuConfigMerge(existing, items, 'OnToolBarChameleon', '/path/MenuConfig.json');

    assert.equal(diff.itemsToAdd.length, 1);
  });

  it('adds only non-duplicate items when mixed', () => {
    const existing = {
      OnToolBarChameleon: [
        { name: 'Tool A', ChameleonTools: '../Python/ToolA/ToolA.json', ExtensionHookName: 'OnToolBarChameleon' }
      ]
    };
    const items = [
      { name: 'Tool A', ChameleonTools: '../Python/ToolA/ToolA.json', ExtensionHookName: 'OnToolBarChameleon' },
      { name: 'Tool B', ChameleonTools: '../Python/ToolB/ToolB.json', ExtensionHookName: 'OnToolBarChameleon' },
    ];
    const diff = planMenuConfigMerge(existing, items, 'OnToolBarChameleon', '/path/MenuConfig.json');

    assert.equal(diff.itemsToAdd.length, 1);
    assert.equal(diff.itemsToAdd[0].name, 'Tool B');
    assert.equal(diff.itemsSkipped.length, 1);
  });

  it('deduplicates python script entries by name and command', () => {
    const existing = {
      OnToolbar: {
        items: [{ name: 'Audit Selection', command: 'import AuditSelection; AuditSelection.run()' }]
      }
    };
    const items = [
      { name: 'Audit Selection', command: 'import AuditSelection; AuditSelection.run()' },
      { name: 'Fix Selection', command: 'import FixSelection; FixSelection.run()' }
    ];

    const diff = planMenuConfigMerge(existing, items, 'OnToolbar', '/path/MenuConfig.json');

    assert.deepEqual(diff.itemsSkipped, [items[0]]);
    assert.deepEqual(diff.itemsToAdd, [items[1]]);
  });

  it('writes new mount points using the official items object shape', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'toolhub-menu-'));
    const filePath = path.join(root, 'MenuConfig.json');
    try {
      const items = [{ name: 'Audit Selection', command: 'import AuditSelection; AuditSelection.run()' }];
      const diff = planMenuConfigMerge({}, items, 'OnToolbar', filePath);

      await applyMenuConfigMerge(filePath, diff);

      const config = JSON.parse(await fs.readFile(filePath, 'utf8'));
      assert.deepEqual(config.OnToolbar, { items });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('removes only the matching python command from the official items shape', () => {
    const config = {
      OnToolbar: {
        items: [
          { name: 'Audit Selection', command: 'import AuditSelection; AuditSelection.run()' },
          { name: 'Fix Selection', command: 'import FixSelection; FixSelection.run()' }
        ]
      }
    };

    const next = removeMenuConfigItems(config, 'OnToolbar', [
      { name: 'Audit Selection', command: 'import AuditSelection; AuditSelection.run()' }
    ]);

    assert.deepEqual(next.OnToolbar, {
      items: [{ name: 'Fix Selection', command: 'import FixSelection; FixSelection.run()' }]
    });
  });
});
