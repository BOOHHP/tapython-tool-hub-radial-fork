import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ToolRecord } from '@tapython-tool-hub/shared';
import { filterCollectionModules, getCatalogTools, getCollectionModules, summarizeCollection } from './model.js';

function tool(slug: string, overrides: Partial<ToolRecord> = {}): ToolRecord {
  return {
    slug,
    name: slug,
    displayName: slug,
    description: `${slug} description`,
    category: 'utility',
    author: 'Scene C',
    ownerTeam: 'Scene C',
    status: 'approved',
    riskLevel: 'low',
    toolType: 'python-script',
    tags: [],
    compatibility: { unrealEngine: ['5.5'], tapython: ['1.2+'], plugins: ['TAPython'] },
    mountPoint: 'OnToolbar',
    installPath: `<Project>/${slug}`,
    sourceDocument: `${slug}.md`,
    updatedAt: '2026-10-08',
    downloads: { latestManifest: '', latestReadme: '', latestPackage: '' },
    summary: { features: [], unrealApis: [], widgetAkas: [], installSteps: [], riskNotes: [] },
    versions: [],
    ...overrides
  };
}

describe('collection model', () => {
  const shell = tool('ue-python-toolkit', {
    collection: { id: 'ue-python-toolkit', role: 'shell', uiKind: 'tkinter-shell' }
  });
  const actorModule = tool('uept-batch-offset-actors', {
    displayName: '批量偏移',
    riskLevel: 'medium',
    collection: {
      id: 'ue-python-toolkit',
      role: 'module',
      moduleId: 'batch_offset_actors',
      categoryPath: ['1_Actor场景', '4_位置变换'],
      requiredShellVersion: '1.0.0',
      sourceSha256: 'a'.repeat(64)
    }
  });
  const queryModule = tool('uept-asset-ref-dep-query', {
    displayName: '资产引用依赖查询',
    description: '查询资产引用和依赖',
    collection: {
      id: 'ue-python-toolkit',
      role: 'module',
      moduleId: 'asset_ref_dep_query',
      categoryPath: ['8_开发测试', '2_只读查询'],
      requiredShellVersion: '1.0.0',
      sourceSha256: 'b'.repeat(64)
    }
  });
  const standalone = tool('standalone-tool');
  const tools = [actorModule, standalone, queryModule, shell];

  it('hides modules from the main catalog but keeps shell and standalone tools', () => {
    assert.deepEqual(getCatalogTools(tools).map((item) => item.slug), ['standalone-tool', 'ue-python-toolkit']);
  });

  it('returns sorted modules for one Collection', () => {
    assert.deepEqual(getCollectionModules(tools, 'ue-python-toolkit').map((item) => item.slug), [
      'uept-batch-offset-actors',
      'uept-asset-ref-dep-query'
    ]);
  });

  it('summarizes categories and risk counts', () => {
    assert.deepEqual(summarizeCollection([actorModule, queryModule]), {
      moduleCount: 2,
      categoryCount: 2,
      categories: [
        { name: '1_Actor场景', count: 1 },
        { name: '8_开发测试', count: 1 }
      ],
      risks: { low: 1, medium: 1, high: 0 }
    });
  });

  it('filters by query, category, risk and status', () => {
    assert.deepEqual(filterCollectionModules([actorModule, queryModule], { query: '引用' }).map((item) => item.slug), ['uept-asset-ref-dep-query']);
    assert.deepEqual(filterCollectionModules([actorModule, queryModule], { category: '1_Actor场景', riskLevel: 'medium', status: 'approved' }).map((item) => item.slug), ['uept-batch-offset-actors']);
  });
});
