import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { toolDetailResponseSchema, toolIndexResponseSchema } from '@tapython-tool-hub/shared';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const toolDataRoot = path.join(root, 'data', 'tools');
const toolDocsRoot = path.join(root, 'data', 'tool-docs');
const publicRoot = path.join(root, 'apps', 'web', 'public');
const apiRoot = path.join(publicRoot, 'api', 'tools');
const downloadRoot = path.join(publicRoot, 'downloads');

async function main() {
  await fs.mkdir(apiRoot, { recursive: true });
  await fs.mkdir(downloadRoot, { recursive: true });

  const toolsBySlug = new Map();

  for (const tool of await readJsonTools()) {
    toolsBySlug.set(tool.slug, tool);
  }

  for (const tool of await readMarkdownTools()) {
    toolsBySlug.set(tool.slug, tool);
  }

  const tools = Array.from(toolsBySlug.values());

  for (const tool of tools) {
    normalizeTool(tool);
    await writeToolApi(tool);
    await writeDownloads(tool);
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
  console.log(`Generated ${tools.length} tool API record(s).`);
}

async function readJsonTools() {
  const fileNames = await listFiles(toolDataRoot, '.json');
  const tools = [];

  for (const fileName of fileNames) {
    const sourcePath = path.join(toolDataRoot, fileName);
    const tool = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
    tools.push(tool);
  }

  return tools;
}

async function readMarkdownTools() {
  const fileNames = await listFiles(toolDocsRoot, '.md');
  const tools = [];

  for (const fileName of fileNames) {
    const sourcePath = path.join(toolDocsRoot, fileName);
    const parsed = matter(await fs.readFile(sourcePath, 'utf8'));
    tools.push(await buildToolFromMarkdown(parsed.data, parsed.content, sourcePath));
  }

  return tools;
}

async function buildToolFromMarkdown(data, markdown, sourcePath) {
  const slug = required(data.slug, 'slug', sourcePath);
  const version = required(data.version, 'version', sourcePath);
  const sourceDocument = path.relative(root, sourcePath).replaceAll(path.sep, '/');
  const assetFiles = await extractCodeAssets(markdown, path.dirname(sourcePath));
  const codeAssets = assetFiles.map(stripAssetContent);
  const latestManifest = buildManifest(data, version, codeAssets, data.updatedAt ?? data.releasedAt);
  const previousVersions = (data.previousVersions ?? []).map((previous) => ({
    version: previous.version,
    releasedAt: previous.releasedAt,
    author: previous.author ?? data.author,
    changeSummary: previous.changeSummary,
    breaking: Boolean(previous.breaking),
    downloads: buildDownloads(slug, previous.version),
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
      latestPackage: data.latestPackage ?? ''
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

async function writeToolApi(tool) {
  const { _assetFiles, ...publicTool } = tool;
  const payload = {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    tool: publicTool
  };
  validatePayload(toolDetailResponseSchema, payload, `tool API '${tool.slug}'`);
  await writeJson(path.join(apiRoot, `${tool.slug}.json`), payload);
}

async function writeDownloads(tool) {
  for (const version of tool.versions) {
    const versionRoot = path.join(downloadRoot, tool.slug, version.version);
    await fs.mkdir(versionRoot, { recursive: true });
    await writeJson(path.join(versionRoot, 'manifest.json'), version.manifest);
    await fs.writeFile(path.join(versionRoot, 'README.md'), buildReadme(tool, version), 'utf8');
    if (tool.documentationMarkdown && version.version === tool.versions[0]?.version) {
      await fs.writeFile(path.join(versionRoot, 'tool.md'), tool.documentationMarkdown, 'utf8');
      await writeAssetFiles(versionRoot, tool._assetFiles ?? []);
    }
  }
}

async function writeAssetFiles(versionRoot, assetFiles) {
  for (const assetFile of assetFiles) {
    const outputPath = resolveInside(versionRoot, assetFile.path);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, assetFile.content, 'utf8');
  }
}

function buildReadme(tool, version) {
  if (tool.documentationMarkdown && version.version === tool.versions[0]?.version) {
    return `${tool.documentationMarkdown.trim()}\n`;
  }
  return `# ${tool.displayName} ${version.version}\n\n${tool.description}\n\n## Install\n\n${tool.summary.installSteps.map((step, index) => `${index + 1}. ${step}`).join('\n')}\n\n## Risk Notes\n\n${tool.summary.riskNotes.map((note) => `- ${note}`).join('\n')}\n\n## Change Summary\n\n${version.changeSummary}\n`;
}

function normalizeTool(tool) {
  tool.versions.sort((left, right) => right.releasedAt.localeCompare(left.releasedAt));
}

function buildDownloads(slug, version) {
  return {
    manifest: `/downloads/${slug}/${version}/manifest.json`,
    readme: `/downloads/${slug}/${version}/README.md`,
    markdown: `/downloads/${slug}/${version}/tool.md`,
    package: ''
  };
}

function buildManifest(data, version, files, fallbackDate) {
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

async function extractCodeAssets(markdown, baseDir) {
  const assets = [];
  const codeFencePattern = /```([^\n]*)\n([\s\S]*?)```/g;
  let match;

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

function getAssetPath(info, content, referencedPath) {
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

function extractWidgetAkas(markdown) {
  return unique(Array.from(markdown.matchAll(/`([a-zA-Z][a-zA-Z0-9_]*?)`/g))
    .map((match) => match[1])
    .filter((value) => value.includes('_')));
}

function extractUnrealApis(markdown) {
  return unique(Array.from(markdown.matchAll(/unreal\.[a-zA-Z0-9_.]+/g)).map((match) => match[0]));
}

function extractOrderedList(markdown, heading) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sectionMatch = markdown.match(new RegExp(`## .*${escapedHeading}.*\\n([\\s\\S]*?)(?=\\n## |$)`));
  if (!sectionMatch) {
    return [];
  }
  return Array.from(sectionMatch[1].matchAll(/^\d+\.\s+(.+)$/gm)).map((match) => match[1].trim());
}

function normalizeCompatibility(compatibility = {}) {
  return {
    unrealEngine: compatibility.unrealEngine ?? [],
    tapython: compatibility.tapython ?? [],
    plugins: compatibility.plugins ?? []
  };
}

function unique(values) {
  return Array.from(new Set(values));
}

function stripAssetContent(asset) {
  const { content, ...publicAsset } = asset;
  return publicAsset;
}

function resolveInside(baseDir, relativePath) {
  const resolvedPath = path.resolve(baseDir, relativePath);
  const resolvedBase = path.resolve(baseDir);
  if (resolvedPath !== resolvedBase && !resolvedPath.startsWith(`${resolvedBase}${path.sep}`)) {
    throw new Error(`Path escapes allowed directory: ${relativePath}`);
  }
  return resolvedPath;
}

async function listFiles(dirPath, extension) {
  try {
    return (await fs.readdir(dirPath)).filter((fileName) => fileName.endsWith(extension));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

function required(value, fieldName, sourcePath) {
  if (value === undefined || value === null || value === '') {
    throw new Error(`${sourcePath}: missing required front matter field '${fieldName}'`);
  }
  return value;
}

function validatePayload(schema, payload, label) {
  const result = schema.safeParse(payload);
  if (result.success) {
    return;
  }

  const details = result.error.issues
    .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
    .join('\n');
  throw new Error(`Generated ${label} failed schema validation:\n${details}`);
}

async function writeJson(filePath, payload) {
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
