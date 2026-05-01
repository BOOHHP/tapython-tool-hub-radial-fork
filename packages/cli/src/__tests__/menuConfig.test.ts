import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planMenuConfigMerge } from '../lib/menuConfig.js';

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
});
