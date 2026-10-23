import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { repairToolPackage } from './packageRepair.js';

describe('packageRepair', () => {
  it('normalizes deterministic python package format problems', () => {
    const result = repairToolPackage({
      formatVersion: 1,
      packageType: 'AI-Generated-Tool',
      name: 'AuditSelection',
      displayName: 'Audit Selection',
      version: '1.0.0',
      toolType: 'python_script',
      install: {
        pythonRoot: 'Python\\AuditSelection\\',
        targetPath: 'TA\\TAPython\\Python\\AuditSelection',
        mountPoint: 'OnToolbar'
      },
      files: [],
      menuEntries: {
        items: [{ name: 'Audit Selection', command: 'import AuditSelection; AuditSelection.run()' }]
      }
    }, new Map([
      ['Python\\AuditSelection\\__init__.py', Buffer.from('from .audit import run\n')],
      ['Python\\AuditSelection\\audit.py', Buffer.from('def run():\n    pass\n')]
    ]), { now: new Date('2026-10-08T00:00:00.000Z') });

    assert.equal(result.report.repairable, true, JSON.stringify(result.report.issues));
    assert.equal(result.manifest?.formatVersion, 2);
    assert.equal(result.manifest?.packageType, 'TAPythonToolPackage');
    assert.equal(result.manifest?.toolType, 'python-script');
    assert.equal(result.manifest?.install.pythonRoot, 'Python/AuditSelection');
    assert.equal(result.manifest?.install.targetPath, '<Project>/TA/TAPython/Python/AuditSelection');
    assert.equal(result.manifest?.install.entryJson, undefined);
    assert.deepEqual(result.manifest?.files.map((file) => file.path), [
      'Python/AuditSelection/__init__.py',
      'Python/AuditSelection/audit.py'
    ]);
    assert.equal(result.manifest?.menuEntries[0]?.command, 'import AuditSelection; AuditSelection.run()');
    assert.ok(result.report.changes.some((change) => change.path === 'files'));
  });

  it('requires a user decision when tool type cannot be inferred', () => {
    const result = repairToolPackage({ name: 'UnknownTool', version: '1.0.0' }, new Map([
      ['Python/UnknownTool/__init__.py', Buffer.from('')]
    ]));

    assert.equal(result.report.repairable, false);
    assert.equal(result.manifest, undefined);
    assert.ok(result.report.issues.some((issue) => issue.code === 'tool_type_required' && issue.level === 'needs-input'));
  });

  it('blocks packages that mix command and ChameleonTools semantics', () => {
    const result = repairToolPackage({
      name: 'MixedTool',
      version: '1.0.0',
      menuEntries: [{
        name: 'Mixed Tool',
        command: 'import MixedTool; MixedTool.run()',
        ChameleonTools: '../Python/MixedTool/MixedTool.json'
      }]
    }, new Map([
      ['Python/MixedTool/MixedTool.py', Buffer.from('')],
      ['Python/MixedTool/MixedTool.json', Buffer.from('{}')]
    ]));

    assert.equal(result.report.repairable, false);
    assert.ok(result.report.issues.some((issue) => issue.code === 'mixed_menu_semantics' && issue.level === 'error'));
  });

  it('requires a safe explicit version instead of guessing release identity', () => {
    const missing = repairToolPackage({ name: 'AuditSelection', toolType: 'python-script' }, new Map([
      ['Python/AuditSelection/__init__.py', Buffer.from('')]
    ]), { command: 'import AuditSelection; AuditSelection.run()' });
    assert.ok(missing.report.issues.some((issue) => issue.code === 'version_required'));

    const unsafe = repairToolPackage({ name: 'AuditSelection', version: '../../outside', toolType: 'python-script' }, new Map([
      ['Python/AuditSelection/__init__.py', Buffer.from('')]
    ]), { command: 'import AuditSelection; AuditSelection.run()' });
    assert.ok(unsafe.report.issues.some((issue) => issue.code === 'version_invalid' && issue.level === 'error'));
  });

  it('rejects a chameleon entry json that is unsafe or missing from the zip', () => {
    const entries = new Map([
      ['Python/ViewTool/ViewTool.py', Buffer.from('')],
      ['Python/ViewTool/ViewTool.json', Buffer.from('{}')]
    ]);
    const unsafe = repairToolPackage({ name: 'ViewTool', version: '1.0.0', toolType: 'chameleon' }, entries, { entryJson: '../../escape.json' });
    assert.ok(unsafe.report.issues.some((issue) => issue.code === 'entry_json_invalid'));

    const missing = repairToolPackage({ name: 'ViewTool', version: '1.0.0', toolType: 'chameleon' }, entries, { entryJson: 'ViewTool/Missing.json' });
    assert.ok(missing.report.issues.some((issue) => issue.code === 'entry_json_missing'));
  });

  it('blocks unsupported extra or binary content instead of silently dropping it', () => {
    const extra = repairToolPackage({ name: 'AuditSelection', version: '1.0.0', toolType: 'python-script' }, new Map([
      ['Python/AuditSelection/__init__.py', Buffer.from('')],
      ['Docs/README.md', Buffer.from('# Readme')]
    ]), { command: 'import AuditSelection; AuditSelection.run()' });
    assert.ok(extra.report.issues.some((issue) => issue.code === 'unsupported_extra_entry'));

    const binary = repairToolPackage({ name: 'AuditSelection', version: '1.0.0', toolType: 'python-script' }, new Map([
      ['Python/AuditSelection/icon.png', Buffer.from([0xff, 0xfe, 0xfd])]
    ]), { command: 'import AuditSelection; AuditSelection.run()' });
    assert.ok(binary.report.issues.some((issue) => issue.code === 'binary_entry_unsupported'));
  });

  it('preserves supported menu extension fields', () => {
    const result = repairToolPackage({
      name: 'AuditSelection',
      version: '1.0.0',
      toolType: 'python-script',
      menuEntries: [{
        name: 'Audit Selection',
        command: 'import AuditSelection; AuditSelection.run()',
        icon: 'Python',
        tooltip: 'Audit selected actors',
        enabled: true
      }]
    }, new Map([['Python/AuditSelection/__init__.py', Buffer.from('')]]));

    assert.equal(result.manifest?.menuEntries[0]?.icon, 'Python');
    assert.equal(result.manifest?.menuEntries[0]?.tooltip, 'Audit selected actors');
    assert.equal(result.manifest?.menuEntries[0]?.enabled, true);
  });

  it('blocks Python text extensions that the publish pipeline cannot preserve', () => {
    const result = repairToolPackage({
      name: 'ShaderTool',
      version: '1.0.0',
      toolType: 'python-script',
      menuEntries: [{ name: 'Shader Tool', command: 'import ShaderTool; ShaderTool.run()' }]
    }, new Map([
      ['Python/ShaderTool/__init__.py', Buffer.from('')],
      ['Python/ShaderTool/config.ini', Buffer.from('[settings]\n')]
    ]));

    assert.equal(result.report.repairable, false);
    assert.ok(result.report.issues.some((issue) => issue.code === 'unsupported_python_entry'));
  });

  it('blocks Python files outside the single tool root', () => {
    const result = repairToolPackage({
      name: 'RootedTool',
      version: '1.0.0',
      toolType: 'python-script',
      menuEntries: [{ name: 'Rooted Tool', command: 'import RootedTool; RootedTool.run()' }]
    }, new Map([
      ['Python/RootedTool/__init__.py', Buffer.from('')],
      ['Python/shared.py', Buffer.from('SHARED = True\n')]
    ]));

    assert.equal(result.report.repairable, false);
    assert.ok(result.report.issues.some((issue) => issue.code === 'python_file_outside_tool_root'));
  });

  it('blocks hotkey and external JSON metadata that cannot be preserved yet', () => {
    const result = repairToolPackage({
      name: 'HotkeyTool',
      version: '1.0.0',
      toolType: 'python-script',
      menuEntries: [{ name: 'Hotkey Tool', command: 'import HotkeyTool; HotkeyTool.run()' }],
      hotkeyEntries: { Hotkey1: { command: 'import HotkeyTool; HotkeyTool.run()' } },
      externalJson: ['HotkeyTool/config.json']
    }, new Map([['Python/HotkeyTool/__init__.py', Buffer.from('')]]));

    assert.equal(result.report.repairable, false);
    assert.ok(result.report.issues.some((issue) => issue.code === 'hotkey_entries_unsupported'));
    assert.ok(result.report.issues.some((issue) => issue.code === 'external_json_unsupported'));
  });

  it('blocks paths that collide on case-insensitive file systems', () => {
    const result = repairToolPackage({
      name: 'CaseTool',
      version: '1.0.0',
      toolType: 'python-script',
      menuEntries: [{ name: 'Case Tool', command: 'import CaseTool; CaseTool.run()' }]
    }, new Map([
      ['Python/CaseTool/config.json', Buffer.from('{}')],
      ['Python/CaseTool/CONFIG.json', Buffer.from('{}')],
      ['Python/CaseTool/__init__.py', Buffer.from('')]
    ]));

    assert.equal(result.report.repairable, false);
    assert.ok(result.report.issues.some((issue) => issue.code === 'case_insensitive_path_collision'));
  });

  it('blocks Windows alternate data streams and normalized trailing dots', () => {
    const alternateStream = repairToolPackage({ name: 'UnsafeTool', version: '1.0.0', toolType: 'python-script' }, new Map([
      ['Python/UnsafeTool/__init__.py:payload.py', Buffer.from('')]
    ]), { command: 'import UnsafeTool; UnsafeTool.run()' });
    assert.ok(alternateStream.report.issues.some((issue) => issue.code === 'unsafe_path'));

    const trailingDot = repairToolPackage({ name: 'UnsafeTool', version: '1.0.0', toolType: 'python-script' }, new Map([
      ['Python/UnsafeTool./__init__.py', Buffer.from('')]
    ]), { command: 'import UnsafeTool; UnsafeTool.run()' });
    assert.ok(trailingDot.report.issues.some((issue) => issue.code === 'unsafe_path'));
  });

  it('uses user decisions to correct existing command and ChameleonTools values', () => {
    const python = repairToolPackage({
      name: 'CommandTool',
      version: '1.0.0',
      toolType: 'python-script',
      menuEntries: [{ name: 'Command Tool', command: '' }]
    }, new Map([['Python/CommandTool/__init__.py', Buffer.from('')]]), {
      command: 'import CommandTool; CommandTool.run()'
    });
    assert.equal(python.report.repairable, true, JSON.stringify(python.report.issues));
    assert.equal(python.manifest?.menuEntries[0]?.command, 'import CommandTool; CommandTool.run()');

    const chameleon = repairToolPackage({
      name: 'ViewTool',
      version: '1.0.0',
      toolType: 'chameleon',
      install: { entryJson: 'ViewTool/ViewTool.json' },
      menuEntries: [{ name: 'View Tool', ChameleonTools: '../Python/ViewTool/Wrong.json' }]
    }, new Map([
      ['Python/ViewTool/ViewTool.py', Buffer.from('')],
      ['Python/ViewTool/ViewTool.json', Buffer.from('{}')]
    ]), { entryJson: 'ViewTool/ViewTool.json' });
    assert.equal(chameleon.report.repairable, true, JSON.stringify(chameleon.report.issues));
    assert.equal(chameleon.manifest?.menuEntries[0]?.ChameleonTools, '../Python/ViewTool/ViewTool.json');
  });

  it('recursively enforces tool type semantics in nested menu items', () => {
    const result = repairToolPackage({
      name: 'NestedTool',
      version: '1.0.0',
      toolType: 'python-script',
      menuEntries: [{
        name: 'Nested Tool',
        command: 'import NestedTool; NestedTool.run()',
        items: [{ name: 'Wrong Child', ChameleonTools: '../Python/NestedTool/NestedTool.json' }]
      }]
    }, new Map([['Python/NestedTool/__init__.py', Buffer.from('')]]));

    assert.equal(result.report.repairable, false);
    assert.ok(result.report.issues.some((issue) => issue.code === 'python_menu_invalid' && issue.path?.includes('items')));
  });

  it('reports semantic defaults instead of applying them silently', () => {
    const result = repairToolPackage({
      name: 'SparseTool',
      version: '1.0.0',
      toolType: 'python-script',
      menuEntries: [{ name: 'Sparse Tool', command: 'import SparseTool; SparseTool.run()' }]
    }, new Map([['Python/SparseTool/__init__.py', Buffer.from('')]]));

    assert.ok(result.report.issues.some((issue) => issue.code === 'metadata_defaults_applied' && issue.level === 'warning'));
    assert.ok(result.report.changes.some((change) => change.path === 'author'));
    assert.ok(result.report.changes.some((change) => change.path === 'riskLevel'));
    assert.ok(result.report.issues.some((issue) => issue.code === 'mount_point_defaulted' && issue.level === 'warning'));
    assert.ok(result.report.changes.some((change) => change.path === 'install.mountPoint'));

    const repeated = repairToolPackage({
      name: 'SparseTool',
      version: '1.0.0',
      toolType: 'python-script',
      menuEntries: [{ name: 'Sparse Tool', command: 'import SparseTool; SparseTool.run()' }]
    }, new Map([['Python/SparseTool/__init__.py', Buffer.from('')]]));
    assert.equal(repeated.manifest?.createdAt, result.manifest?.createdAt);
    assert.equal(repeated.manifest?.updatedAt, result.manifest?.updatedAt);
  });
});