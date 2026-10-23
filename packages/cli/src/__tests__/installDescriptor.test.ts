import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeV2InstallDescriptor } from '../lib/installDescriptor.js';
import type { V2InstallManifest } from '../lib/installDescriptor.js';

describe('installDescriptor', () => {
  it('normalizes a python script package into OnToolbar command installation', () => {
    const descriptor = normalizeV2InstallDescriptor({
      formatVersion: 2,
      packageType: 'TAPythonToolPackage',
      toolType: 'python-script',
      install: {
        pythonRoot: 'Python/SelectionAuditScript',
        targetPath: '<Project>/TA/TAPython/Python/SelectionAuditScript',
        mountPoint: 'OnToolbar'
      },
      files: [
        { path: 'Python/SelectionAuditScript/__init__.py', sha256: 'a'.repeat(64), size: 1 },
        { path: 'Python/SelectionAuditScript/selection_audit.py', sha256: 'b'.repeat(64), size: 2 }
      ],
      menuEntries: [
        { name: 'Selection Audit', command: 'import SelectionAuditScript; SelectionAuditScript.run()' }
      ],
      postInstallSteps: ['Reload TAPython']
    });

    assert.equal(descriptor.toolType, 'python-script');
    assert.equal(descriptor.installPath, '<Project>/TA/TAPython/Python/SelectionAuditScript');
    assert.deepEqual(descriptor.files.map((file) => [file.packagePath, file.targetPath]), [
      ['Python/SelectionAuditScript/__init__.py', '__init__.py'],
      ['Python/SelectionAuditScript/selection_audit.py', 'selection_audit.py']
    ]);
    assert.equal(descriptor.menuConfigMerge.mountPoint, 'OnToolbar');
    assert.equal(descriptor.menuConfigMerge.itemsToAdd[0]?.command, 'import SelectionAuditScript; SelectionAuditScript.run()');
  });

  it('normalizes a chameleon package without nesting its python root twice', () => {
    const descriptor = normalizeV2InstallDescriptor({
      formatVersion: 2,
      packageType: 'TAPythonToolPackage',
      toolType: 'chameleon',
      install: {
        pythonRoot: 'Python/ActorRenameTool',
        targetPath: '<Project>/TA/TAPython/Python/ActorRenameTool',
        entryJson: 'ActorRenameTool/ActorRenameTool.json',
        mountPoint: 'OnToolBarChameleon'
      },
      files: [
        { path: 'Python/ActorRenameTool/ActorRenameTool.py', sha256: 'a'.repeat(64), size: 1 }
      ],
      menuEntries: [
        { name: 'Actor Rename Tool', ChameleonTools: '../Python/ActorRenameTool/ActorRenameTool.json' }
      ],
      postInstallSteps: []
    });

    assert.equal(descriptor.files[0]?.targetPath, 'ActorRenameTool.py');
    assert.equal(descriptor.menuConfigMerge.mountPoint, 'OnToolBarChameleon');
  });

  it('rejects files outside install.pythonRoot', () => {
    assert.throws(() => normalizeV2InstallDescriptor({
      formatVersion: 2,
      packageType: 'TAPythonToolPackage',
      toolType: 'python-script',
      install: {
        pythonRoot: 'Python/SafeTool',
        targetPath: '<Project>/TA/TAPython/Python/SafeTool',
        mountPoint: 'OnToolbar'
      },
      files: [{ path: 'Python/OtherTool/escape.py', sha256: 'a'.repeat(64), size: 1 }],
      menuEntries: [{ name: 'Safe Tool', command: 'import SafeTool; SafeTool.run()' }],
      postInstallSteps: []
    }), /outside install\.pythonRoot/);
  });

  it('rejects python scripts that declare a chameleon entry json', () => {
    assert.throws(() => normalizeV2InstallDescriptor({
      formatVersion: 2,
      packageType: 'TAPythonToolPackage',
      toolType: 'python-script',
      install: {
        pythonRoot: 'Python/AuditSelection',
        targetPath: '<Project>/TA/TAPython/Python/AuditSelection',
        entryJson: 'AuditSelection/AuditSelection.json',
        mountPoint: 'OnToolbar'
      },
      files: [{ path: 'Python/AuditSelection/__init__.py', sha256: 'a'.repeat(64), size: 1 }],
      menuEntries: [{ name: 'Audit Selection', command: 'import AuditSelection; AuditSelection.run()' }],
      postInstallSteps: []
    }), /must not declare install\.entryJson/);
  });

  it('rejects v2 packages without installable files', () => {
    assert.throws(() => normalizeV2InstallDescriptor({
      formatVersion: 2,
      packageType: 'TAPythonToolPackage',
      toolType: 'python-script',
      install: {
        pythonRoot: 'Python/AuditSelection',
        targetPath: '<Project>/TA/TAPython/Python/AuditSelection',
        mountPoint: 'OnToolbar'
      },
      files: [],
      menuEntries: [{ name: 'Audit Selection', command: 'import AuditSelection; AuditSelection.run()' }],
      postInstallSteps: []
    }), /at least one installable file/);
  });

  it('rejects manifests with an unsupported format version', () => {
    assert.throws(() => normalizeV2InstallDescriptor({
      formatVersion: 1,
      packageType: 'TAPythonToolPackage'
    } as unknown as V2InstallManifest), /Unsupported formatVersion/);
  });

  it('rejects manifests with an unsupported package type', () => {
    assert.throws(() => normalizeV2InstallDescriptor({
      formatVersion: 2,
      packageType: 'LegacyToolPackage'
    } as unknown as V2InstallManifest), /Unsupported packageType/);
  });

  it('rejects install targets that escape the selected project', () => {
    assert.throws(() => normalizeV2InstallDescriptor({
      formatVersion: 2,
      packageType: 'TAPythonToolPackage',
      toolType: 'python-script',
      install: {
        pythonRoot: 'Python/AuditSelection',
        targetPath: '<Project>/../../outside/AuditSelection',
        mountPoint: 'OnToolbar'
      },
      files: [{ path: 'Python/AuditSelection/__init__.py', sha256: 'a'.repeat(64), size: 1 }],
      menuEntries: [{ name: 'Audit Selection', command: 'import AuditSelection; AuditSelection.run()' }],
      postInstallSteps: []
    }), /Invalid install\.targetPath/);
  });

  it('rejects Windows-unsafe package file paths', () => {
    assert.throws(() => normalizeV2InstallDescriptor({
      formatVersion: 2,
      packageType: 'TAPythonToolPackage',
      toolType: 'python-script',
      install: {
        pythonRoot: 'Python/UnsafeTool',
        targetPath: '<Project>/TA/TAPython/Python/UnsafeTool',
        mountPoint: 'OnToolbar'
      },
      files: [{ path: 'Python/UnsafeTool/main.py:payload.py', sha256: 'a'.repeat(64), size: 1 }],
      menuEntries: [{ name: 'Unsafe Tool', command: 'import UnsafeTool; UnsafeTool.run()' }],
      postInstallSteps: []
    }), /invalid target path|invalid package path/i);
  });
});