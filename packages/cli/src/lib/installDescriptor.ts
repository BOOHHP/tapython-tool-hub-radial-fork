import path from 'node:path';
import type { MenuConfigItem, ToolType } from '@tapython-tool-hub/shared';
import { CliError } from './types.js';

export interface V2InstallManifest {
  formatVersion: 2;
  packageType: 'TAPythonToolPackage';
  toolType?: ToolType;
  install: {
    pythonRoot: string;
    targetPath: string;
    entryJson?: string;
    mountPoint: string;
  };
  files: Array<{ path: string; sha256: string; size: number }>;
  menuEntries: MenuConfigItem[];
  postInstallSteps: string[];
}

export interface InstallDescriptor {
  toolType: ToolType;
  installPath: string;
  files: Array<{
    packagePath: string;
    targetPath: string;
    sha256: string;
    size: number;
  }>;
  menuConfigMerge: {
    target: string;
    mountPoint: string;
    itemsToAdd: MenuConfigItem[];
  };
  postInstallSteps: string[];
}

export function normalizeV2InstallDescriptor(manifest: V2InstallManifest): InstallDescriptor {
  if (manifest.formatVersion !== 2) {
    throw new CliError(`Unsupported formatVersion: ${String(manifest.formatVersion)}`, 'INVALID_MANIFEST');
  }
  if (manifest.packageType !== 'TAPythonToolPackage') {
    throw new CliError(`Unsupported packageType: ${String(manifest.packageType)}`, 'INVALID_MANIFEST');
  }

  const toolType = manifest.toolType ?? 'chameleon';
  if (toolType !== 'chameleon' && toolType !== 'python-script') {
    throw new CliError(`Unsupported toolType: ${String(toolType)}`, 'INVALID_MANIFEST');
  }
  if (toolType === 'chameleon' && !manifest.install.entryJson) {
    throw new CliError('Chameleon tools require install.entryJson', 'INVALID_MANIFEST');
  }
  if (toolType === 'python-script' && manifest.install.entryJson) {
    throw new CliError('Python scripts must not declare install.entryJson', 'INVALID_MANIFEST');
  }
  if (manifest.files.length === 0) {
    throw new CliError('v2 packages require at least one installable file', 'INVALID_MANIFEST');
  }

  for (const item of flattenMenuEntries(manifest.menuEntries)) {
    const hasChameleonTools = Boolean(item.ChameleonTools);
    const hasCommand = Boolean(item.command);
    if (hasChameleonTools === hasCommand) {
      throw new CliError('Menu entries require exactly one of ChameleonTools or command', 'INVALID_MANIFEST');
    }
    if (toolType === 'chameleon' && !hasChameleonTools) {
      throw new CliError('Chameleon tools require ChameleonTools menu entries', 'INVALID_MANIFEST');
    }
    if (toolType === 'python-script' && !hasCommand) {
      throw new CliError('Python scripts require command menu entries', 'INVALID_MANIFEST');
    }
  }

  const installPath = normalizePackagePath(manifest.install.targetPath).replace(/\/$/, '');
  const installPathSegments = installPath.slice('<Project>/'.length).split('/');
  if (!installPath.startsWith('<Project>/') || installPathSegments.some((segment) => !isSafeWindowsPathSegment(segment))) {
    throw new CliError(`Invalid install.targetPath: ${manifest.install.targetPath}`, 'INVALID_MANIFEST');
  }

  const pythonRoot = normalizePackagePath(manifest.install.pythonRoot).replace(/\/$/, '');
  if (!pythonRoot.startsWith('Python/') || pythonRoot.split('/').some((segment) => !isSafeWindowsPathSegment(segment))) {
    throw new CliError(`Invalid install.pythonRoot: ${manifest.install.pythonRoot}`, 'INVALID_MANIFEST');
  }

  const rootPrefix = `${pythonRoot}/`;
  const files = manifest.files.map((file) => {
    const packagePath = normalizePackagePath(file.path);
    if (packagePath.split('/').some((segment) => !isSafeWindowsPathSegment(segment))) {
      throw new CliError(`${file.path}: invalid package path`, 'INVALID_MANIFEST');
    }
    if (!packagePath.startsWith(rootPrefix)) {
      throw new CliError(`${file.path}: outside install.pythonRoot ${pythonRoot}`, 'INVALID_MANIFEST');
    }
    const targetPath = packagePath.slice(rootPrefix.length);
    if (!targetPath || targetPath.split('/').some((segment) => !isSafeWindowsPathSegment(segment))) {
      throw new CliError(`${file.path}: invalid target path`, 'INVALID_MANIFEST');
    }
    return { packagePath, targetPath, sha256: file.sha256, size: file.size };
  });

  return {
    toolType,
    installPath,
    files,
    menuConfigMerge: {
      target: '<Project>/TA/TAPython/UI/MenuConfig.json',
      mountPoint: manifest.install.mountPoint,
      itemsToAdd: manifest.menuEntries
    },
    postInstallSteps: manifest.postInstallSteps
  };
}

function normalizePackagePath(value: string): string {
  return value.split(path.win32.sep).join('/');
}

function isSafeWindowsPathSegment(segment: string): boolean {
  if (!segment || segment === '.' || segment === '..' || /[<>:"|?*\x00-\x1f]/.test(segment) || /[. ]$/.test(segment)) return false;
  const stem = segment.split('.')[0];
  return !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem);
}

function flattenMenuEntries(entries: MenuConfigItem[]): MenuConfigItem[] {
  return entries.flatMap((entry) => [entry, ...(entry.items ? flattenMenuEntries(entry.items) : [])]);
}