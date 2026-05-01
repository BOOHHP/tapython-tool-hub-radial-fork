import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { toolDetailResponseSchema, toolIndexResponseSchema } from '@tapython-tool-hub/shared';

export interface GenerateToolDataOptions {
  root: string;
  toolDataRoot: string;
  toolDocsRoot: string;
  apiRoot: string;
  downloadRoot: string;
}

export interface GenerateToolDataResult {
  toolCount: number;
}

interface AssetFile {
  path: string;
  sha256: string;
  size: number;
  content?: string;
}

interface ZipEntry {
  path: string;
  content: Buffer;
}

type ToolData = Record<string, any>;

export async function generateToolData(options: GenerateToolDataOptions): Promise<GenerateToolDataResult> {
  const { apiRoot, downloadRoot } = options;

  await fs.mkdir(apiRoot, { recursive: true });
  await fs.mkdir(downloadRoot, { recursive: true });

  const toolsBySlug = new Map<string, ToolData>();

  for (const tool of await readJsonTools(options.toolDataRoot)) {
    toolsBySlug.set(tool.slug, tool);
  }

  for (const tool of await readMarkdownTools(options)) {
    toolsBySlug.set(tool.slug, tool);
  }

  const tools = Array.from(toolsBySlug.values());

  for (const tool of tools) {
    normalizeTool(tool);
    await writeToolApi(tool, options.apiRoot);
    await writeDownloads(tool, options.downloadRoot);
  }

  tools.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  const index = {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    total: tools.length,
    tools: tools.map((tool) => ({
      slug: tool.slug,
      name: tool.name,
      displayName: tool.displayName,
      description: tool.description,
      category: tool.category,
      author: tool.author,
      ownerTeam: tool.ownerTeam,
      status: tool.status,
      riskLevel: tool.riskLevel,
      tags: tool.tags,
      compatibility: tool.compatibility,
      mountPoint: tool.mountPoint,
      installPath: tool.installPath,
      latestVersion: tool.versions[0]?.version ?? '',
      updatedAt: tool.updatedAt,
      apiUrl: `/api/tools/${tool.slug}.json`,
      sourceDocument: tool.sourceDocument,
      sourceMode: tool.sourceMode,
      downloads: tool.downloads
    }))
  };

  validatePayload(toolIndexResponseSchema, index, 'tool index API');
  await writeJson(path.join(apiRoot, 'index.json'), index);

  return { toolCount: tools.length };
}

async function readJsonTools(toolDataRoot: string): Promise<ToolData[]> {
  const fileNames = await listFiles(toolDataRoot, '.json');
  const tools: ToolData[] = [];

  for (const fileName of fileNames) {
    const sourcePath = path.join(toolDataRoot, fileName);
    const tool = JSON.parse(await fs.readFile(sourcePath, 'utf8')) as ToolData;
    tools.push(tool);
  }

  return tools;
}

async function readMarkdownTools(options: GenerateToolDataOptions): Promise<ToolData[]> {
  const fileNames = await listFiles(options.toolDocsRoot, '.md');
  const tools: ToolData[] = [];

  for (const fileName of fileNames) {
    const sourcePath = path.join(options.toolDocsRoot, fileName);
    const parsed = matter(await fs.readFile(sourcePath, 'utf8'));
    tools.push(await buildToolFromMarkdown(parsed.data, parsed.content, sourcePath, options.root));
  }

  return tools;
}

async function buildToolFromMarkdown(data: ToolData, markdown: string, sourcePath: string, root: string): Promise<ToolData> {
  const slug = required(data.slug, 'slug', sourcePath);
  const version = required(data.version, 'version', sourcePath);
  const sourceDocument = path.relative(root, sourcePath).split(path.sep).join('/');
  const assetFiles = await extractCodeAssets(markdown, path.dirname(sourcePath));
  const codeAssets = assetFiles.map(stripAssetContent);
  const latestManifest = buildManifest(data, version, codeAssets, data.updatedAt ?? data.releasedAt);
  const previousVersions = (data.previousVersions ?? []).map((previous: ToolData) => ({
    version: previous.version,
    releasedAt: previous.releasedAt,
    author: previous.author ?? data.author,
    changeSummary: previous.changeSummary,
    breaking: Boolean(previous.breaking),
    downloads: buildDownloads(slug, previous.version, false),
    manifest: buildManifest(
      {
        ...data,
        ...previous.manifestOverrides,
        compatibility: previous.manifestOverrides?.compatibility ?? data.compatibility,
        tags: previous.manifestOverrides?.tags ?? data.tags,
        files: previous.files ?? data.files
      },
      previous.version,
      previous.files,
      previous.releasedAt
    )
  }));

  return {
    slug,
    name: required(data.name, 'name', sourcePath),
    displayName: data.displayName ?? data.name,
    description: required(data.description, 'description', sourcePath),
    category: required(data.category, 'category', sourcePath),
    author: required(data.author, 'author', sourcePath),
    ownerTeam: data.ownerTeam ?? data.author,
    status: data.status ?? 'draft',
    riskLevel: data.riskLevel ?? 'medium',
    tags: data.tags ?? [],
    compatibility: normalizeCompatibility(data.compatibility),
    mountPoint: required(data.mountPoint, 'mountPoint', sourcePath),
    installPath: required(data.installPath, 'installPath', sourcePath),
    entryJson: required(data.entryJson, 'entryJson', sourcePath),
    sourceDocument,
    sourceMode: data.sourceMode ?? 'markdown-first',
    updatedAt: data.updatedAt ?? data.releasedAt ?? new Date().toISOString().slice(0, 10),
    downloads: {
      latestManifest: `/downloads/${slug}/${version}/manifest.json`,
      latestReadme: `/downloads/${slug}/${version}/README.md`,
      latestMarkdown: `/downloads/${slug}/${version}/tool.md`,
      latestPackage: `/downloads/${slug}/${version}/${slug}-${version}.zip`
    },
    summary: {
      features: data.summary?.features ?? [],
      unrealApis: data.summary?.unrealApis ?? extractUnrealApis(markdown),
      widgetAkas: data.summary?.widgetAkas ?? extractWidgetAkas(markdown),
      installSteps: data.summary?.installSteps ?? extractOrderedList(markdown, '快速开始'),
      riskNotes: data.summary?.riskNotes ?? []
    },
    documentationMarkdown: markdown.trim(),
    codeAssets,
    _assetFiles: assetFiles,
    versions: [
      {
        version,
        releasedAt: data.releasedAt ?? data.updatedAt ?? new Date().toISOString().slice(0, 10),
        author: data.author,
        changeSummary: data.changeSummary ?? 'Markdown-first tool document update.',
        breaking: Boolean(data.breaking),
        downloads: buildDownloads(slug, version),
        manifest: latestManifest
      },
      ...previousVersions
    ]
  };
}

async function writeToolApi(tool: ToolData, apiRoot: string): Promise<void> {
  const { _assetFiles, ...publicTool } = tool;
  const payload = {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    tool: publicTool
  };
  validatePayload(toolDetailResponseSchema, payload, `tool API '${tool.slug}'`);
  await writeJson(path.join(apiRoot, `${tool.slug}.json`), payload);
}

async function writeDownloads(tool: ToolData, downloadRoot: string): Promise<void> {
  for (const version of tool.versions) {
    const versionRoot = path.join(downloadRoot, tool.slug, version.version);
    await fs.mkdir(versionRoot, { recursive: true });
    await writeJson(path.join(versionRoot, 'manifest.json'), version.manifest);
    await writeUtf8Markdown(path.join(versionRoot, 'README.md'), buildReadme(tool, version));
    if (tool.documentationMarkdown && version.version === tool.versions[0]?.version) {
      await writeUtf8Markdown(path.join(versionRoot, 'tool.md'), tool.documentationMarkdown);
      await writeAssetFiles(versionRoot, tool._assetFiles ?? []);
    }
    if (version.downloads.package && await hasPackageFiles(versionRoot, version.manifest.files)) {
      await writePackageArchive(versionRoot, `${tool.slug}-${version.version}.zip`, version.releasedAt);
    } else {
      await fs.rm(path.join(versionRoot, `${tool.slug}-${version.version}.zip`), { force: true });
      version.downloads.package = '';
    }
  }
}

async function writeUtf8Markdown(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, `\uFEFF${content}`, 'utf8');
}

async function writeAssetFiles(versionRoot: string, assetFiles: AssetFile[]): Promise<void> {
  for (const assetFile of assetFiles) {
    const outputPath = resolveInside(versionRoot, assetFile.path);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, assetFile.content ?? '', 'utf8');
  }
}

function buildReadme(tool: ToolData, version: ToolData): string {
  if (tool.documentationMarkdown && version.version === tool.versions[0]?.version) {
    return `${tool.documentationMarkdown.trim()}\n`;
  }
  return `# ${tool.displayName} ${version.version}\n\n${tool.description}\n\n## Install\n\n${tool.summary.installSteps.map((step: string, index: number) => `${index + 1}. ${step}`).join('\n')}\n\n## Risk Notes\n\n${tool.summary.riskNotes.map((note: string) => `- ${note}`).join('\n')}\n\n## Change Summary\n\n${version.changeSummary}\n`;
}

function normalizeTool(tool: ToolData): void {
  tool.versions.sort((left: ToolData, right: ToolData) => right.releasedAt.localeCompare(left.releasedAt));
  for (const version of tool.versions) {
    const packagePath = version.downloads?.package ?? '';
    version.downloads = {
      ...buildDownloads(tool.slug, version.version, Boolean(packagePath)),
      ...version.downloads,
      package: packagePath
    };
  }
  tool.downloads = {
    ...tool.downloads,
    latestPackage: tool.downloads?.latestPackage || tool.versions[0]?.downloads?.package || ''
  };
}

function buildDownloads(slug: string, version: string, includePackage = true): ToolData {
  return {
    manifest: `/downloads/${slug}/${version}/manifest.json`,
    readme: `/downloads/${slug}/${version}/README.md`,
    markdown: `/downloads/${slug}/${version}/tool.md`,
    package: includePackage ? `/downloads/${slug}/${version}/${slug}-${version}.zip` : ''
  };
}

async function hasPackageFiles(versionRoot: string, files: AssetFile[]): Promise<boolean> {
  if (files.length === 0) {
    return false;
  }
  for (const file of files) {
    try {
      await fs.access(resolveInside(versionRoot, file.path));
    } catch {
      return false;
    }
  }
  return true;
}

async function writePackageArchive(versionRoot: string, archiveName: string, releasedAt: string): Promise<void> {
  const archivePath = path.join(versionRoot, archiveName);
  const filePaths = await listPackageFiles(versionRoot, archivePath);
  const entries = await Promise.all(filePaths.map(async (filePath) => ({
    path: path.relative(versionRoot, filePath).split(path.sep).join('/'),
    content: await fs.readFile(filePath)
  })));
  await fs.writeFile(archivePath, createZipArchive(entries, releasedAt));
}

async function listPackageFiles(directory: string, archivePath: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listPackageFiles(entryPath, archivePath));
      continue;
    }
    if (entry.isFile() && entryPath !== archivePath) {
      files.push(entryPath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function createZipArchive(entries: ZipEntry[], releasedAt: string): Buffer {
  const localParts: Buffer[] = [];
  const centralDirectory: Buffer[] = [];
  let offset = 0;
  const { dosTime, dosDate } = getDosDateTime(releasedAt);

  for (const entry of entries) {
    const name = Buffer.from(entry.path, 'utf8');
    const checksum = crc32(entry.content);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(entry.content.length, 18);
    localHeader.writeUInt32LE(entry.content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, entry.content);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(entry.content.length, 20);
    centralHeader.writeUInt32LE(entry.content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralDirectory.push(Buffer.concat([centralHeader, name]));

    offset += localHeader.length + name.length + entry.content.length;
  }

  const centralParts = centralDirectory;
  const centralSize = centralParts.reduce((total, entry) => total + entry.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, end]);
}

function getDosDateTime(releasedAt: string): { dosDate: number; dosTime: number } {
  const date = new Date(`${releasedAt}T00:00:00Z`);
  const validDate = Number.isNaN(date.getTime()) ? new Date('1980-01-01T00:00:00Z') : date;
  const year = Math.max(validDate.getUTCFullYear(), 1980);
  return {
    dosDate: validDate.getUTCDate() | ((validDate.getUTCMonth() + 1) << 5) | ((year - 1980) << 9),
    dosTime: Math.floor(validDate.getUTCSeconds() / 2) | (validDate.getUTCMinutes() << 5) | (validDate.getUTCHours() << 11)
  };
}

function crc32(content: Buffer): number {
  let checksum = 0xffffffff;
  for (const byte of content) {
    checksum = CRC32_TABLE[(checksum ^ byte) & 0xff] ^ (checksum >>> 8);
  }
  return (checksum ^ 0xffffffff) >>> 0;
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function buildManifest(data: ToolData, version: string, files: AssetFile[] | undefined, fallbackDate: string): ToolData {
  return {
    schemaVersion: data.schemaVersion ?? '1.0.0',
    name: data.name,
    displayName: data.displayName ?? data.name,
    version,
    author: data.author,
    description: data.manifestDescription ?? data.description,
    category: data.category,
    tags: data.tags ?? [],
    compatibility: normalizeCompatibility(data.compatibility),
    dependencies: data.dependencies ?? [],
    mountPoint: data.mountPoint,
    installPath: data.installPath,
    entryJson: data.entryJson,
    riskLevel: data.riskLevel ?? 'medium',
    files: (files ?? data.files ?? []).map(stripAssetContent),
    menuConfigMerge: data.menuConfigMerge,
    preInstallChecks: data.preInstallChecks ?? [],
    postInstallSteps: data.postInstallSteps ?? [],
    uninstallSteps: data.uninstallSteps ?? [],
    createdAt: data.createdAt ?? fallbackDate,
    updatedAt: data.updatedAt ?? fallbackDate
  };
}

async function extractCodeAssets(markdown: string, baseDir: string): Promise<AssetFile[]> {
  const assets: AssetFile[] = [];
  const codeFencePattern = /```([^\n]*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = codeFencePattern.exec(markdown)) !== null) {
    const info = match[1].trim();
    const rawContent = match[2].trim();
    const fileReference = rawContent.match(/^@file:(.+)$/m);
    const content = fileReference
      ? await fs.readFile(resolveInside(baseDir, fileReference[1].trim()), 'utf8')
      : rawContent;
    const assetPath = getAssetPath(info, rawContent, fileReference?.[1]);

    if (!assetPath) {
      continue;
    }

    assets.push({
      path: assetPath,
      sha256: crypto.createHash('sha256').update(content).digest('hex'),
      size: Buffer.byteLength(content, 'utf8'),
      content
    });
  }

  const hasInit = assets.some((asset) => asset.path.endsWith('/__init__.py'));
  if (!hasInit) {
    const toolFolder = assets.find((asset) => asset.path.includes('/'))?.path.split('/')[0];
    if (toolFolder) {
      assets.push({
        path: `${toolFolder}/__init__.py`,
        sha256: crypto.createHash('sha256').update('').digest('hex'),
        size: 0,
        content: ''
      });
    }
  }

  return assets;
}

function getAssetPath(info: string, content: string, referencedPath?: string): string {
  const pathMatch = info.match(/path=([^\s]+)/);
  if (pathMatch) {
    return pathMatch[1];
  }
  if (referencedPath) {
    return referencedPath;
  }
  if (info.includes('menuconfig')) {
    return 'MenuConfig.snippet.json';
  }
  if (content.includes('ExtensionHookName') && content.includes('ChameleonTools')) {
    return 'MenuConfig.snippet.json';
  }
  return '';
}

function extractWidgetAkas(markdown: string): string[] {
  return unique(Array.from(markdown.matchAll(/`([a-zA-Z][a-zA-Z0-9_]*?)`/g))
    .map((match) => match[1])
    .filter((value) => value.includes('_')));
}

function extractUnrealApis(markdown: string): string[] {
  return unique(Array.from(markdown.matchAll(/unreal\.[a-zA-Z0-9_.]+/g)).map((match) => match[0]));
}

function extractOrderedList(markdown: string, heading: string): string[] {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sectionMatch = markdown.match(new RegExp(`## .*${escapedHeading}.*\\n([\\s\\S]*?)(?=\\n## |$)`));
  if (!sectionMatch) {
    return [];
  }
  return Array.from(sectionMatch[1].matchAll(/^\d+\.\s+(.+)$/gm)).map((match) => match[1].trim());
}

function normalizeCompatibility(compatibility: ToolData = {}): ToolData {
  return {
    unrealEngine: compatibility.unrealEngine ?? [],
    tapython: compatibility.tapython ?? [],
    plugins: compatibility.plugins ?? []
  };
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function stripAssetContent(asset: AssetFile): Omit<AssetFile, 'content'> {
  const { content, ...publicAsset } = asset;
  return publicAsset;
}

function resolveInside(baseDir: string, relativePath: string): string {
  const resolvedPath = path.resolve(baseDir, relativePath);
  const resolvedBase = path.resolve(baseDir);
  if (resolvedPath !== resolvedBase && !resolvedPath.startsWith(`${resolvedBase}${path.sep}`)) {
    throw new Error(`Path escapes allowed directory: ${relativePath}`);
  }
  return resolvedPath;
}

async function listFiles(dirPath: string, extension: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files = await Promise.all(entries.map(async (entry) => {
      if (entry.isDirectory()) {
        return (await listFiles(path.join(dirPath, entry.name), extension)).map((fileName) => path.join(entry.name, fileName));
      }
      return entry.isFile() && entry.name.endsWith(extension) ? [entry.name] : [];
    }));
    return files.flat().sort();
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

function required(value: unknown, fieldName: string, sourcePath: string): string {
  if (value === undefined || value === null || value === '') {
    throw new Error(`${sourcePath}: missing required front matter field '${fieldName}'`);
  }
  return String(value);
}

function validatePayload(schema: { safeParse: (payload: unknown) => { success: true } | { success: false; error: { issues: Array<{ path: Array<string | number>; message: string }> } } }, payload: unknown, label: string): void {
  const result = schema.safeParse(payload);
  if (result.success) {
    return;
  }

  const details = result.error.issues
    .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
    .join('\n');
  throw new Error(`Generated ${label} failed schema validation:\n${details}`);
}

async function writeJson(filePath: string, payload: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
