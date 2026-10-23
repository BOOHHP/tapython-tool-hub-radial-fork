import crypto from 'node:crypto';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { tapythonToolPackageManifestSchema } from '@tapython-tool-hub/shared';
import type { MenuConfigItem, PackageRepairChange, PackageRepairDecisions, PackageRepairIssue, PackageRepairReport, TapythonToolPackageManifest, ToolType } from '@tapython-tool-hub/shared';

export interface PackageRepairOptions extends PackageRepairDecisions {
  now?: Date;
}

export interface PackageRepairResult {
  report: PackageRepairReport;
  manifest?: TapythonToolPackageManifest;
  entries: Map<string, Buffer>;
}

export function repairToolPackage(rawManifest: unknown, rawEntries: Map<string, Buffer>, options: PackageRepairOptions = {}): PackageRepairResult {
  const changes: PackageRepairChange[] = [];
  const issues: PackageRepairIssue[] = [];
  const source = isRecord(rawManifest) ? rawManifest : {};
  const entries = normalizeEntries(rawEntries, changes, issues);
  for (const [entryPath, content] of entries) {
    if (!entryPath.startsWith('Python/')) {
      issues.push({ code: 'unsupported_extra_entry', level: 'error', path: entryPath, message: '首版修复器仅支持 Python/** 文本文件；请先移除或手动处理 Docs/Assets/Config 内容。' });
    } else if (entryPath.split('/').length <= 2) {
      issues.push({ code: 'python_file_outside_tool_root', level: 'error', path: entryPath, message: 'Python 文件必须位于唯一的 Python/<Tool>/ 工具根目录内。' });
    } else if (!isUtf8Text(content)) {
      issues.push({ code: 'binary_entry_unsupported', level: 'error', path: entryPath, message: '当前投稿链路仅支持文本资源，不能安全重写二进制文件。' });
    } else if (!['.py', '.json'].includes(path.posix.extname(entryPath).toLowerCase())) {
      issues.push({ code: 'unsupported_python_entry', level: 'error', path: entryPath, message: '首版修复器只能保证 .py 和 .json 文件完整进入发布包；请手动处理其他文本资源。' });
    }
  }

  if (source.hotkeyEntries !== undefined && (!isRecord(source.hotkeyEntries) || Object.keys(source.hotkeyEntries).length > 0)) {
    issues.push({ code: 'hotkey_entries_unsupported', level: 'error', path: 'hotkeyEntries', message: '首版修复器暂不能保证 HotkeyConfig 内容完整发布，请手动规范后投稿。' });
  }
  if (source.externalJson !== undefined && (!Array.isArray(source.externalJson) || source.externalJson.length > 0)) {
    issues.push({ code: 'external_json_unsupported', level: 'error', path: 'externalJson', message: '首版修复器暂不能保证 externalJson 引用完整发布，请手动规范后投稿。' });
  }
  const pythonFiles = Array.from(entries.entries())
    .filter(([entryPath]) => entryPath.startsWith('Python/') && entryPath.split('/').length > 2)
    .sort(([left], [right]) => left.localeCompare(right));
  const toolRoots = new Set(pythonFiles.map(([entryPath]) => entryPath.split('/')[1]));

  if (pythonFiles.length === 0) {
    issues.push({ code: 'python_files_missing', level: 'error', path: 'Python/', message: 'ZIP 中未找到 Python/<Tool>/ 下的可安装文件。' });
  }
  if (toolRoots.size !== 1) {
    issues.push({ code: 'python_root_ambiguous', level: 'error', path: 'install.pythonRoot', message: '无法唯一确定 Python 工具根目录。' });
  }

  const toolRoot = toolRoots.size === 1 ? Array.from(toolRoots)[0] : undefined;
  const rawMenuEntries = unwrapMenuEntries(source.menuEntries);
  const menuSignals = inspectMenuSignals(rawMenuEntries);
  if (menuSignals.mixedEntry || (menuSignals.hasCommand && menuSignals.hasChameleonTools)) {
    issues.push({ code: 'mixed_menu_semantics', level: 'error', path: 'menuEntries', message: '菜单同时包含 command 与 ChameleonTools，无法安全判断工具类型。' });
  }

  const toolType = options.toolType ?? normalizeToolType(source.toolType) ?? inferToolType(source, menuSignals);
  if (!toolType) {
    issues.push({ code: 'tool_type_required', level: 'needs-input', path: 'toolType', message: '无法唯一判断工具类型，请选择 Python 脚本或 Chameleon 工具。' });
  }

  const name = readString(source.name) ?? toolRoot;
  const displayName = readString(source.displayName) ?? name;
  const slug = normalizeSlug(readString(source.slug) ?? name);
  const version = readString(options.version) ?? readString(source.version);
  const now = options.now ?? new Date('1970-01-01T00:00:00.000Z');
  const date = now.toISOString().slice(0, 10);
  const timestamp = now.toISOString();

  if (!name || !displayName || !slug) {
    issues.push({ code: 'identity_missing', level: 'needs-input', path: 'slug', message: '无法从 manifest 或目录名确定工具名称与 slug。' });
  }
  if (!version) {
    issues.push({ code: 'version_required', level: 'needs-input', path: 'version', message: '无法安全猜测发布版本，请确认版本号。' });
  } else if (!/^[0-9A-Za-z][0-9A-Za-z._-]{0,63}$/.test(version)) {
    issues.push({ code: 'version_invalid', level: 'error', path: 'version', message: '版本号必须是安全的单路径段，仅允许字母、数字、点、下划线和连字符。' });
  }

  let entryJson: string | undefined;
  if (toolType === 'chameleon' && toolRoot) {
    entryJson = normalizeOptionalPath(options.entryJson ?? readString(asRecord(source.install)?.entryJson));
    if (entryJson && (!isSafePackagePath(entryJson) || !entryJson.startsWith(`${toolRoot}/`) || !entryJson.toLowerCase().endsWith('.json'))) {
      issues.push({ code: 'entry_json_invalid', level: 'error', path: 'install.entryJson', message: 'entryJson 必须是工具根目录内的安全 JSON 相对路径。' });
    } else if (entryJson && !entries.has(`Python/${entryJson}`)) {
      issues.push({ code: 'entry_json_missing', level: 'error', path: 'install.entryJson', message: 'entryJson 指向的文件不存在于 ZIP。' });
    }
    if (!entryJson) {
      const candidates = pythonFiles
        .map(([entryPath]) => entryPath)
        .filter((entryPath) => entryPath.toLowerCase().endsWith('.json') && !/menuconfig/i.test(entryPath))
        .map((entryPath) => entryPath.slice('Python/'.length));
      if (candidates.length === 1) {
        entryJson = candidates[0];
        changes.push({ path: 'install.entryJson', after: entryJson, reason: '根据唯一的 Chameleon JSON 文件补全入口。' });
      } else {
        issues.push({ code: 'entry_json_required', level: 'needs-input', path: 'install.entryJson', message: 'Chameleon 工具缺少唯一可确定的 entryJson。' });
      }
    }
  }

  const menuEntries = normalizeMenuEntries(rawMenuEntries, toolType, displayName, entryJson, options.command, issues, changes);
  if (toolType) validateNestedMenuEntries(menuEntries, toolType, issues, 'menuEntries');
  const hasBlockers = issues.some((issue) => issue.level === 'error' || issue.level === 'needs-input');
  if (hasBlockers || !toolType || !toolRoot || !name || !displayName || !slug || !version) {
    return { report: { repairable: false, detected: { slug, version, toolType }, changes, issues }, entries };
  }

  const install = asRecord(source.install);
  const sourceMountPoint = readString(install?.mountPoint);
  const mountPoint = sourceMountPoint ?? (toolType === 'python-script' ? 'OnToolbar' : 'OnToolBarChameleon');
  if (!sourceMountPoint) {
    issues.push({ code: 'mount_point_defaulted', level: 'warning', path: 'install.mountPoint', message: `缺少挂载点，已按工具类型使用 ${mountPoint}，请在提交前确认。` });
  }
  const author = readString(source.author) ?? 'Local Project';
  const ownerTeam = readString(source.ownerTeam) ?? 'Local Project';
  const description = readString(source.description) ?? `${displayName} TAPython tool.`;
  const category = readString(source.category) ?? 'utility';
  const riskLevel = normalizeRiskLevel(source.riskLevel);
  const compatibility = normalizeCompatibility(source.compatibility);
  const semanticDefaults: string[] = [];
  if (!readString(source.author)) semanticDefaults.push('author');
  if (!readString(source.ownerTeam)) semanticDefaults.push('ownerTeam');
  if (!readString(source.description)) semanticDefaults.push('description');
  if (!readString(source.category)) semanticDefaults.push('category');
  if (!['low', 'medium', 'high'].includes(String(source.riskLevel))) semanticDefaults.push('riskLevel');
  if (!isRecord(source.compatibility)) semanticDefaults.push('compatibility');
  if (!readString(source.releasedAt)) semanticDefaults.push('releasedAt');
  if (!readString(source.createdAt)) semanticDefaults.push('createdAt');
  if (!readString(source.updatedAt)) semanticDefaults.push('updatedAt');
  if (semanticDefaults.length > 0) {
    issues.push({
      code: 'metadata_defaults_applied',
      level: 'warning',
      path: semanticDefaults.join(', '),
      message: `以下发布语义缺失或无效，已使用保守默认值，请在提交前确认：${semanticDefaults.join('、')}。`
    });
  }
  const manifestCandidate: TapythonToolPackageManifest = {
    formatVersion: 2,
    packageType: 'TAPythonToolPackage',
    schemaVersion: readString(source.schemaVersion) ?? '1.0.0',
    slug,
    name,
    displayName,
    version,
    releasedAt: readString(source.releasedAt) ?? date,
    author,
    ownerTeam,
    description,
    category,
    toolType,
    riskLevel,
    tags: readStringArray(source.tags),
    compatibility,
    dependencies: readStringArray(source.dependencies),
    install: {
      pythonRoot: `Python/${toolRoot}`,
      targetPath: `<Project>/TA/TAPython/Python/${toolRoot}`,
      ...(entryJson ? { entryJson } : {}),
      mountPoint
    },
    files: pythonFiles.map(([filePath, content]) => ({
      path: filePath,
      sha256: crypto.createHash('sha256').update(content).digest('hex'),
      size: content.length,
      role: inferFileRole(filePath)
    })),
    menuEntries: menuEntries.map((entry) => ({ ...entry, ExtensionHookName: entry.ExtensionHookName ?? mountPoint })),
    hotkeyEntries: isRecord(source.hotkeyEntries) ? source.hotkeyEntries : {},
    externalJson: readStringArray(source.externalJson).map(normalizePackagePath),
    summary: normalizeSummary(source.summary),
    preInstallChecks: readStringArray(source.preInstallChecks),
    postInstallSteps: readStringArray(source.postInstallSteps),
    uninstallSteps: readStringArray(source.uninstallSteps),
    createdAt: readString(source.createdAt) ?? timestamp,
    updatedAt: readString(source.updatedAt) ?? timestamp
  };

  recordChange(changes, 'formatVersion', source.formatVersion, 2, '统一为 TAPython Tool Package v2。');
  recordChange(changes, 'packageType', source.packageType, 'TAPythonToolPackage', '统一包类型常量。');
  recordChange(changes, 'toolType', source.toolType, toolType, '统一工具类型枚举。');
  recordChange(changes, 'install.pythonRoot', install?.pythonRoot, manifestCandidate.install.pythonRoot, '根据 ZIP 实际目录统一 Python 根路径。');
  recordChange(changes, 'install.targetPath', install?.targetPath, manifestCandidate.install.targetPath, '限制安装目标位于项目 TAPython 目录。');
  recordChange(changes, 'install.mountPoint', install?.mountPoint, mountPoint, '缺失时按已确认的工具类型使用默认挂载点，提交前需确认。');
  recordChange(changes, 'author', source.author, author, '缺失时使用本地项目占位值，提交前需确认。');
  recordChange(changes, 'ownerTeam', source.ownerTeam, ownerTeam, '缺失时使用本地项目占位值，提交前需确认。');
  recordChange(changes, 'description', source.description, description, '缺失时根据显示名称生成占位说明，提交前需确认。');
  recordChange(changes, 'category', source.category, category, '缺失时归入 utility，提交前需确认。');
  recordChange(changes, 'riskLevel', source.riskLevel, riskLevel, '缺失或无效时使用 medium，提交前需确认。');
  recordChange(changes, 'compatibility', source.compatibility, compatibility, '缺失时使用保守兼容性占位值，提交前需确认。');
  recordChange(changes, 'releasedAt', source.releasedAt, manifestCandidate.releasedAt, '缺失时使用确定性占位日期，提交前需确认。');
  recordChange(changes, 'createdAt', source.createdAt, manifestCandidate.createdAt, '缺失时使用确定性占位时间，提交前需确认。');
  recordChange(changes, 'updatedAt', source.updatedAt, manifestCandidate.updatedAt, '缺失时使用确定性占位时间，提交前需确认。');
  changes.push({ path: 'files', before: summarizeValue(source.files), after: `${manifestCandidate.files.length} 个文件`, reason: '根据 ZIP 实际内容重建 path、sha256 与 size。' });

  const parsed = tapythonToolPackageManifestSchema.safeParse(manifestCandidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push({ code: 'schema_validation_failed', level: 'error', path: issue.path.join('.'), message: issue.message });
    }
    return { report: { repairable: false, detected: { slug, version, toolType }, changes, issues }, entries };
  }

  return {
    manifest: parsed.data,
    entries,
    report: { repairable: true, detected: { slug, version, toolType }, changes, issues }
  };
}

function normalizeEntries(rawEntries: Map<string, Buffer>, changes: PackageRepairChange[], issues: PackageRepairIssue[]): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  const caseInsensitivePaths = new Map<string, string>();
  for (const [rawPath, content] of rawEntries) {
    const normalizedPath = normalizePackagePath(rawPath).replace(/^\.\//, '');
    if (/^manifest\.json$/i.test(normalizedPath)) continue;
    if (!isSafePackagePath(normalizedPath)) {
      issues.push({ code: 'unsafe_path', level: 'error', path: rawPath, message: `不安全的 ZIP 路径：${rawPath}` });
      continue;
    }
    if (entries.has(normalizedPath)) {
      issues.push({ code: 'normalized_path_collision', level: 'error', path: rawPath, message: `路径规范化后发生冲突：${normalizedPath}` });
      continue;
    }
    const caseInsensitivePath = normalizedPath.toLowerCase();
    const existingPath = caseInsensitivePaths.get(caseInsensitivePath);
    if (existingPath && existingPath !== normalizedPath) {
      issues.push({ code: 'case_insensitive_path_collision', level: 'error', path: rawPath, message: `路径在 Windows 上发生大小写冲突：${existingPath} / ${normalizedPath}` });
      continue;
    }
    caseInsensitivePaths.set(caseInsensitivePath, normalizedPath);
    entries.set(normalizedPath, content);
    if (rawPath !== normalizedPath) {
      changes.push({ path: rawPath, before: rawPath, after: normalizedPath, reason: '统一 ZIP 路径分隔符。' });
    }
  }
  return entries;
}

function normalizeMenuEntries(rawEntries: unknown[], toolType: ToolType | undefined, displayName: string | undefined, entryJson: string | undefined, command: string | undefined, issues: PackageRepairIssue[], changes: PackageRepairChange[]): MenuConfigItem[] {
  const entries = rawEntries.filter(isRecord).map((entry) => {
    const chameleonTools = readString(getCaseInsensitive(entry, 'ChameleonTools'));
    const menuCommand = readString(getCaseInsensitive(entry, 'command'));
    const extensionHookName = readString(getCaseInsensitive(entry, 'ExtensionHookName'));
    const preserved = Object.fromEntries(Object.entries(entry).filter(([key]) => !['name', 'chameleontools', 'command', 'extensionhookname'].includes(key.toLowerCase())));
    return {
      ...preserved,
      name: readString(entry.name) ?? displayName ?? 'TAPython Tool',
      ...(chameleonTools ? { ChameleonTools: chameleonTools } : {}),
      ...(menuCommand ? { command: menuCommand } : {}),
      ...(extensionHookName ? { ExtensionHookName: extensionHookName } : {})
    };
  });

  if (rawEntries.length !== entries.length) {
    issues.push({ code: 'menu_entry_invalid', level: 'error', path: 'menuEntries', message: 'menuEntries 包含非对象项。' });
    return entries;
  }
  if (!toolType) return entries;

  if (entries.length > 0 && toolType === 'python-script' && command) {
    for (const entry of entries) {
      if (entry.command !== command) {
        changes.push({ path: 'menuEntries.command', before: typeof entry.command === 'string' ? entry.command : '未提供', after: command, reason: '使用用户确认的 Python 执行命令。' });
      }
      delete entry.ChameleonTools;
      entry.command = command;
    }
  }
  if (entries.length > 0 && toolType === 'chameleon' && entryJson) {
    const chameleonTools = `../Python/${entryJson}`;
    for (const entry of entries) {
      if (entry.ChameleonTools !== chameleonTools) {
        changes.push({ path: 'menuEntries.ChameleonTools', before: typeof entry.ChameleonTools === 'string' ? entry.ChameleonTools : '未提供', after: chameleonTools, reason: '使用用户确认的 Chameleon 入口。' });
      }
      delete entry.command;
      entry.ChameleonTools = chameleonTools;
    }
  }

  if (entries.length === 0) {
    if (toolType === 'python-script') {
      if (!command) {
        issues.push({ code: 'command_required', level: 'needs-input', path: 'menuEntries.command', message: '纯 Python 脚本缺少可执行 command。' });
        return entries;
      }
      entries.push({ name: displayName ?? 'Python Script', command });
    } else if (entryJson) {
      entries.push({ name: displayName ?? 'Chameleon Tool', ChameleonTools: `../Python/${entryJson}` });
    }
    changes.push({ path: 'menuEntries', after: '已创建标准菜单项', reason: '根据已确认的工具类型与入口补全菜单项。' });
  }

  for (const entry of entries) {
    if (toolType === 'python-script' && (!entry.command || entry.ChameleonTools)) {
      issues.push({ code: 'python_menu_invalid', level: 'error', path: 'menuEntries', message: 'Python 脚本菜单必须仅使用 command。' });
    }
    if (toolType === 'chameleon' && (!entry.ChameleonTools || entry.command)) {
      issues.push({ code: 'chameleon_menu_invalid', level: 'error', path: 'menuEntries', message: 'Chameleon 工具菜单必须仅使用 ChameleonTools。' });
    } else if (toolType === 'chameleon' && entryJson) {
      const menuPath = normalizeOptionalPath(typeof entry.ChameleonTools === 'string' ? entry.ChameleonTools.replace(/^\.\.\/Python\//, '') : undefined);
      if (menuPath !== entryJson) {
        issues.push({ code: 'chameleon_menu_mismatch', level: 'error', path: 'menuEntries.ChameleonTools', message: 'ChameleonTools 与 install.entryJson 不一致。' });
      }
    }
  }
  return entries;
}

function inspectMenuSignals(entries: unknown[]): { hasCommand: boolean; hasChameleonTools: boolean; mixedEntry: boolean } {
  let hasCommand = false;
  let hasChameleonTools = false;
  let mixedEntry = false;
  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    const command = Boolean(readString(getCaseInsensitive(entry, 'command')));
    const chameleon = Boolean(readString(getCaseInsensitive(entry, 'ChameleonTools')));
    hasCommand ||= command;
    hasChameleonTools ||= chameleon;
    mixedEntry ||= command && chameleon;
  }
  return { hasCommand, hasChameleonTools, mixedEntry };
}

function inferToolType(source: Record<string, unknown>, signals: ReturnType<typeof inspectMenuSignals>): ToolType | undefined {
  if (signals.hasCommand && !signals.hasChameleonTools) return 'python-script';
  if (signals.hasChameleonTools && !signals.hasCommand) return 'chameleon';
  if (readString(asRecord(source.install)?.entryJson)) return 'chameleon';
  return undefined;
}

function normalizeToolType(value: unknown): ToolType | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase().replace(/_/g, '-');
  if (['python-script', 'python', 'script', 'pure-python'].includes(normalized)) return 'python-script';
  if (['chameleon', 'chameleon-tool', 'ui'].includes(normalized)) return 'chameleon';
  return undefined;
}

function unwrapMenuEntries(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (isRecord(value) && Array.isArray(value.items)) return value.items;
  return [];
}

function normalizeCompatibility(value: unknown): TapythonToolPackageManifest['compatibility'] {
  const compatibility = asRecord(value);
  return {
    unrealEngine: readStringArray(compatibility?.unrealEngine),
    tapython: readStringArray(compatibility?.tapython),
    plugins: readStringArray(compatibility?.plugins).length > 0 ? readStringArray(compatibility?.plugins) : ['TAPython']
  };
}

function normalizeSummary(value: unknown): TapythonToolPackageManifest['summary'] {
  const summary = asRecord(value);
  return {
    features: readStringArray(summary?.features),
    unrealApis: readStringArray(summary?.unrealApis),
    widgetAkas: readStringArray(summary?.widgetAkas),
    riskNotes: readStringArray(summary?.riskNotes)
  };
}

function normalizeRiskLevel(value: unknown): TapythonToolPackageManifest['riskLevel'] {
  return value === 'low' || value === 'high' ? value : 'medium';
}

function normalizeSlug(value: string | undefined): string | undefined {
  const normalized = value?.trim().replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return normalized || undefined;
}

function normalizeOptionalPath(value: string | undefined): string | undefined {
  const normalized = value ? normalizePackagePath(value).replace(/^Python\//, '').replace(/^\/+|\/+$/g, '') : '';
  return normalized || undefined;
}

function normalizePackagePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
}

function isSafePackagePath(value: string): boolean {
  return Boolean(value) && !value.startsWith('/') && !/^[a-zA-Z]:/.test(value) && value.split('/').every(isSafeWindowsPathSegment);
}

function isSafeWindowsPathSegment(segment: string): boolean {
  if (!segment || segment === '.' || segment === '..' || /[<>:"|?*\x00-\x1f]/.test(segment) || /[. ]$/.test(segment)) return false;
  const stem = segment.split('.')[0];
  return !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem);
}

function inferFileRole(filePath: string): string {
  const extension = path.posix.extname(filePath).toLowerCase();
  if (extension === '.py') return 'python';
  if (extension === '.json') return 'chameleon-ui';
  return 'asset';
}

function recordChange(changes: PackageRepairChange[], fieldPath: string, before: unknown, after: unknown, reason: string): void {
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  changes.push({ path: fieldPath, before: summarizeValue(before), after: summarizeValue(after), reason });
}

function summarizeValue(value: unknown): string {
  if (value === undefined) return '未提供';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim()) : [];
}

function getCaseInsensitive(value: Record<string, unknown>, key: string): unknown {
  const entry = Object.entries(value).find(([entryKey]) => entryKey.toLowerCase() === key.toLowerCase());
  return entry?.[1];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUtf8Text(content: Buffer): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(content);
    return true;
  } catch {
    return false;
  }
}

function validateNestedMenuEntries(entries: MenuConfigItem[], toolType: ToolType, issues: PackageRepairIssue[], pathPrefix: string): void {
  entries.forEach((entry, index) => {
    const entryPath = `${pathPrefix}.${index}`;
    if (toolType === 'python-script' && (!entry.command || entry.ChameleonTools)) {
      issues.push({ code: 'python_menu_invalid', level: 'error', path: entryPath, message: 'Python 脚本菜单及其子菜单必须仅使用 command。' });
    }
    if (toolType === 'chameleon' && (!entry.ChameleonTools || entry.command)) {
      issues.push({ code: 'chameleon_menu_invalid', level: 'error', path: entryPath, message: 'Chameleon 菜单及其子菜单必须仅使用 ChameleonTools。' });
    }
    if (Array.isArray(entry.items)) validateNestedMenuEntries(entry.items, toolType, issues, `${entryPath}.items`);
  });
}