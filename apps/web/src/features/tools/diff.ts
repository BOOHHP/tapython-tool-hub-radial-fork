import type { FileDiffRow, ManifestDiffRow, ToolFileManifest, ToolManifest } from '../../types';

export function buildManifestDiff(from: ToolManifest, to: ToolManifest): ManifestDiffRow[] {
  const rows: Array<[keyof ToolManifest, string]> = [
    ['version', '版本'],
    ['description', '描述'],
    ['category', '分类'],
    ['tags', '标签'],
    ['compatibility', '兼容性'],
    ['mountPoint', '挂载点'],
    ['installPath', '安装路径'],
    ['riskLevel', '风险等级'],
    ['preInstallChecks', '安装前检查'],
    ['postInstallSteps', '安装后步骤']
  ];

  return rows.map(([key, label]) => {
    const fromValue = stringifyDiffValue(from[key]);
    const toValue = stringifyDiffValue(to[key]);
    return {
      key: String(key),
      label,
      fromValue,
      toValue,
      changed: fromValue !== toValue
    };
  });
}

export function buildFileDiff(fromFiles: ToolFileManifest[], toFiles: ToolFileManifest[]): FileDiffRow[] {
  const fromMap = new Map(fromFiles.map((file) => [file.path, file]));
  const toMap = new Map(toFiles.map((file) => [file.path, file]));
  const paths = Array.from(new Set([...fromMap.keys(), ...toMap.keys()])).sort();

  return paths.map((path) => {
    const fromFile = fromMap.get(path);
    const toFile = toMap.get(path);
    const status: FileDiffRow['status'] = !fromFile
      ? 'added'
      : !toFile
        ? 'removed'
        : fromFile.sha256 === toFile.sha256 && fromFile.size === toFile.size
          ? 'unchanged'
          : 'modified';

    return {
      path,
      status,
      fromHash: fromFile?.sha256 ?? '-',
      toHash: toFile?.sha256 ?? '-',
      fromSize: fromFile?.size,
      toSize: toFile?.size
    };
  });
}

function stringifyDiffValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  if (value && typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value ?? '');
}