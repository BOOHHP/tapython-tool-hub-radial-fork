import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import matter from 'gray-matter';
import { generateToolData } from '@tapython-tool-hub/tooling';
import { tapythonToolPackageManifestSchema } from '@tapython-tool-hub/shared';
import type { PackageRepairReport, ReviewRecord, ReviewSubmissionRequest, SubmissionAssetPayload, SubmissionRecord, TapythonToolPackageManifest, ToolSubmissionRequest, ValidationIssue, ValidationReport } from '@tapython-tool-hub/shared';
import type { ApiConfig } from '../config/env.js';
import type { SubmissionRepository } from '../repositories/submissionRepository.js';
import { repairToolPackage } from './packageRepair.js';
import type { PackageRepairOptions } from './packageRepair.js';

interface GeneratedToolApiPayload {
  tool?: {
    slug?: string;
    toolType?: 'chameleon' | 'python-script';
    versions?: Array<{ version: string }>;
  };
}

interface ZipEntryContent {
  content: Buffer;
}

interface PackageSubmissionInput {
  packageBuffer: Buffer;
  submitter: string;
  notes?: string;
  metadata?: PackageSubmissionMetadata;
}

interface PackageRepairInput extends PackageRepairOptions {
  packageBuffer: Buffer;
}

interface RawPackageForRepair {
  manifest: unknown;
  entries: Map<string, Buffer>;
  manifestError?: string;
}

interface RepairedPackageSubmissionInput extends PackageSubmissionInput, PackageRepairOptions {}

export interface RepairedPackageSubmissionResult {
  submission?: SubmissionRecord;
  repairReport: PackageRepairReport;
}

export interface PackageSubmissionMetadata {
  displayName?: string;
  description?: string;
  author?: string;
  ownerTeam?: string;
  category?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  unrealEngine?: string[];
  tapython?: string[];
  plugins?: string[];
  tags?: string[];
  features?: string[];
  unrealApis?: string[];
  widgetAkas?: string[];
  riskNotes?: string[];
}

interface ParsedToolPackage {
  manifest: TapythonToolPackageManifest;
  entries: Map<string, ZipEntryContent>;
  packageSha256: string;
}

export const MAX_PACKAGE_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 256;
const MAX_ZIP_ENTRY_BYTES = 5 * 1024 * 1024;
const MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES = 10 * 1024 * 1024;
const MAX_ZIP_COMPRESSION_RATIO = 100;

export class PackageResourceLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PackageResourceLimitError';
  }
}

export class SubmissionWorkflow {
  private readonly packageSubmissionLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly config: ApiConfig,
    private readonly repository: SubmissionRepository
  ) {}

  async createSubmission(request: ToolSubmissionRequest): Promise<SubmissionRecord> {
    const validationReport = await this.validate(request);
    return this.repository.create(request, validationReport);
  }

  async createPackageSubmission(input: PackageSubmissionInput): Promise<SubmissionRecord> {
    const parsedPackage = parseToolPackage(input.packageBuffer);
    const publishManifest = applyPackageSubmissionMetadata(parsedPackage.manifest, input.submitter, input.metadata);
    const request = buildSubmissionRequestFromPackage({ ...parsedPackage, manifest: publishManifest }, input.submitter, input.notes);
    const submission = await this.createSubmission(request);
    await this.writeSubmittedPackage(submission.id, parsedPackage.manifest, input.packageBuffer);
    return submission;
  }

  analyzePackageRepair(input: PackageRepairInput): PackageRepairReport {
    const rawPackage = readRawPackageForRepair(input.packageBuffer);
    if (rawPackage.manifestError) return invalidManifestRepairReport(rawPackage.manifestError);
    return repairToolPackage(rawPackage.manifest, rawPackage.entries, input).report;
  }

  async createRepairedPackageSubmission(input: RepairedPackageSubmissionInput): Promise<RepairedPackageSubmissionResult> {
    const rawPackage = readRawPackageForRepair(input.packageBuffer);
    if (rawPackage.manifestError) {
      return { repairReport: invalidManifestRepairReport(rawPackage.manifestError) };
    }
    const repaired = repairToolPackage(rawPackage.manifest, rawPackage.entries, input);
    if (!repaired.manifest) {
      return { repairReport: repaired.report };
    }

    const publishManifest = applyPackageSubmissionMetadata(repaired.manifest, input.submitter, input.metadata);
    const parsedPackage: ParsedToolPackage = {
      manifest: publishManifest,
      entries: new Map(Array.from(repaired.entries, ([entryPath, content]) => [entryPath, { content }])),
      packageSha256: crypto.createHash('sha256').update(input.packageBuffer).digest('hex')
    };
    const repairFingerprint = crypto.createHash('sha256').update(JSON.stringify(publishManifest)).digest('hex');
    const repairNote = `Package repair: ${repaired.report.changes.length} deterministic change(s).`;
    const fingerprintNote = `Repair fingerprint: ${repairFingerprint}`;
    const request = await this.preservePublishedVersionHistory(buildSubmissionRequestFromPackage(
      parsedPackage,
      input.submitter,
      [input.notes, repairNote, fingerprintNote].filter(Boolean).join('\n')
    ));
    const validationReport = await this.validate(request);
    if (!validationReport.valid) {
      return {
        repairReport: {
          ...repaired.report,
          repairable: false,
          issues: [
            ...repaired.report.issues,
            ...validationReport.issues.map((issue) => ({
              code: 'submission_validation_failed',
              level: 'error' as const,
              path: issue.path,
              message: issue.message
            }))
          ]
        }
      };
    }

    const lockKey = `${publishManifest.slug}@${publishManifest.version}`;
    return this.withPackageSubmissionLock(lockKey, async () => {
      const existingSubmissions = await this.findPendingPackageSubmissions(publishManifest.slug, publishManifest.version);
      const matchingSubmission = existingSubmissions.find((submission) =>
        submission.notes?.includes(fingerprintNote) &&
        submission.submitter === request.submitter &&
        submission.markdown === request.markdown &&
        JSON.stringify(submission.assets) === JSON.stringify(request.assets)
      );
      if (matchingSubmission) {
        await this.writeRepairedPackageArchive(publishManifest, repairFingerprint, input.packageBuffer);
        return { submission: matchingSubmission, repairReport: repaired.report };
      }
      if (existingSubmissions.length > 0) {
        return {
          repairReport: {
            ...repaired.report,
            repairable: false,
            issues: [
              ...repaired.report.issues,
              {
                code: 'pending_submission_conflict',
                level: 'error' as const,
                path: 'version',
                message: `工具 ${publishManifest.slug}@${publishManifest.version} 已有内容不同的待审核投稿；请撤回旧投稿或使用新版本。`
              }
            ]
          }
        };
      }

      const archiveCreated = await this.writeRepairedPackageArchive(publishManifest, repairFingerprint, input.packageBuffer);
      try {
        const submission = await this.repository.create(request, validationReport);
        return { submission, repairReport: repaired.report };
      } catch (error) {
        if (archiveCreated) {
          await fs.rm(this.getRepairedPackagePath(publishManifest, repairFingerprint), { force: true });
        }
        throw error;
      }
    });
  }

  async reviewSubmission(id: string, request: ReviewSubmissionRequest): Promise<SubmissionRecord | undefined> {
    const submission = await this.repository.get(id);
    if (!submission) {
      return undefined;
    }

    const review: ReviewRecord = {
      id: crypto.randomUUID(),
      reviewer: request.reviewer,
      decision: request.decision,
      comment: request.comment,
      createdAt: new Date().toISOString()
    };

    if (request.decision === 'approved') {
      return this.withPackageSubmissionLock('__publish__', async () => {
        const current = await this.repository.get(id);
        if (!current) return undefined;
        if (current.status === 'approved') return current;

        const latestValidation = await this.validate(current);
        current.validationReport = latestValidation;
        if (!latestValidation.valid) {
          current.status = 'draft';
          await this.repository.save(current);
          throw new Error(`Cannot approve submission after revalidation: ${latestValidation.issues.map((issue) => issue.message).join('; ')}`);
        }

        await this.publish(current);
        current.status = 'approved';
        current.reviews = [review, ...current.reviews];
        return this.repository.save(current);
      });
    }

    if (request.decision === 'rejected') {
      submission.status = 'rejected';
    } else {
      submission.status = 'draft';
    }

    submission.reviews = [review, ...submission.reviews];
    return this.repository.save(submission);
  }

  private async validate(request: ToolSubmissionRequest): Promise<ValidationReport> {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tapython-tool-submission-'));
    const toolDocsRoot = path.join(temporaryRoot, 'tool-docs');
    const apiRoot = path.join(temporaryRoot, 'api', 'tools');
    const downloadRoot = path.join(temporaryRoot, 'downloads');
    const issues: ValidationIssue[] = [];

    try {
      await writeSubmittedFiles(toolDocsRoot, request);
      const result = await generateToolData({
        root: temporaryRoot,
        toolDataRoot: path.join(temporaryRoot, 'tools'),
        toolDocsRoot,
        apiRoot,
        downloadRoot
      });

      const { payload: generatedTool, generatedSlugs } = await readGeneratedToolApi(apiRoot, request.slug);
      const generatedSlug = generatedTool?.tool?.slug;
      if (!generatedTool) {
        issues.push({
          level: 'error',
          path: 'slug',
          message: generatedSlugs.length > 0
            ? `提交表单 slug (${request.slug}) 与 Markdown front matter slug (${generatedSlugs.join(', ')}) 不一致；请保持一致。`
            : `未生成工具 API 文件 ${request.slug}.json，请检查 Markdown front matter slug。`
        });
      } else if (generatedSlug && generatedSlug !== request.slug) {
        issues.push({
          level: 'error',
          path: 'slug',
          message: `提交表单 slug (${request.slug}) 与 Markdown front matter slug (${generatedSlug}) 不一致；请保持一致。`
        });
      }

      const generatedToolType = generatedTool?.tool?.toolType ?? 'chameleon';
      if (request.toolType && request.toolType !== generatedToolType) {
        issues.push({
          level: 'error',
          path: 'toolType',
          message: `提交类型 (${request.toolType}) 与 Markdown toolType (${generatedToolType}) 不一致；请保持一致。`
        });
      }

      const submittedVersion = generatedTool?.tool?.versions?.[0]?.version;
      if (submittedVersion && await versionAlreadyPublished(this.config.toolApiRoot, generatedSlug ?? request.slug, submittedVersion)) {
        issues.push({
          level: 'error',
          path: 'version',
          message: `版本 ${submittedVersion} 已发布；已发布版本不可变，请提交新版本。`
        });
      }

      return {
        valid: issues.every((issue) => issue.level !== 'error'),
        issues,
        generatedToolCount: result.toolCount
      };
    } catch (error) {
      return {
        valid: false,
        issues: [{ level: 'error', message: error instanceof Error ? error.message : String(error) }]
      };
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  }

  private async publish(submission: SubmissionRecord): Promise<void> {
    await writeSubmittedFiles(path.join(this.config.toolDocsRoot, submission.slug), {
      ...submission,
      markdown: markMarkdownApproved(submission.markdown)
    });
    await generateToolData({
      root: this.config.repoRoot,
      toolDataRoot: this.config.toolDataRoot,
      toolDocsRoot: this.config.toolDocsRoot,
      apiRoot: this.config.toolApiRoot,
      downloadRoot: this.config.downloadRoot
    });
  }

  private async writeSubmittedPackage(id: string, manifest: TapythonToolPackageManifest, packageBuffer: Buffer): Promise<void> {
    const packageRoot = path.join(this.config.submissionRoot, 'packages');
    await fs.mkdir(packageRoot, { recursive: true });
    await fs.writeFile(this.getSubmittedPackagePath(id, manifest), packageBuffer);
  }

  private getSubmittedPackagePath(id: string, manifest: Pick<TapythonToolPackageManifest, 'slug' | 'version'>): string {
    return path.join(this.config.submissionRoot, 'packages', `${id}-${manifest.slug}-${manifest.version}.tapython-tool.zip`);
  }

  private async findPendingPackageSubmissions(slug: string, version: string): Promise<SubmissionRecord[]> {
    const matches: SubmissionRecord[] = [];
    for (const submission of await this.repository.list()) {
      if (submission.status !== 'pending' || submission.slug !== slug) continue;
      try {
        if (String(matter(submission.markdown).data.version ?? '') === version) matches.push(submission);
      } catch {
        // Ignore malformed historical records; normal validation handles new submissions.
      }
    }
    return matches;
  }

  private async preservePublishedVersionHistory(request: ToolSubmissionRequest): Promise<ToolSubmissionRequest> {
    let existingPayload: {
      tool?: {
        versions?: Array<{
          version: string;
          releasedAt?: string;
          author?: string;
          changeSummary?: string;
          breaking?: boolean;
          manifest?: Record<string, unknown>;
        }>;
      };
    };
    try {
      existingPayload = JSON.parse(await fs.readFile(path.join(this.config.toolApiRoot, `${request.slug}.json`), 'utf8'));
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return request;
      throw error;
    }

    const parsed = matter(request.markdown);
    const currentVersion = String(parsed.data.version ?? '');
    const previousVersions = (existingPayload.tool?.versions ?? [])
      .filter((version) => version.version !== currentVersion)
      .map((version) => {
        const manifest = version.manifest ?? {};
        return {
          version: version.version,
          releasedAt: version.releasedAt,
          author: version.author,
          changeSummary: version.changeSummary,
          breaking: Boolean(version.breaking),
          files: Array.isArray(manifest.files) ? manifest.files : [],
          manifestOverrides: {
            description: manifest.description,
            compatibility: manifest.compatibility,
            tags: manifest.tags,
            menuConfigMerge: manifest.menuConfigMerge,
            preInstallChecks: manifest.preInstallChecks,
            postInstallSteps: manifest.postInstallSteps,
            uninstallSteps: manifest.uninstallSteps,
            ...(manifest.collection ? { collection: manifest.collection } : {})
          }
        };
      });

    if (previousVersions.length === 0) return request;
    return {
      ...request,
      markdown: matter.stringify(parsed.content, { ...parsed.data, previousVersions })
    };
  }

  private getRepairedPackagePath(manifest: Pick<TapythonToolPackageManifest, 'slug' | 'version'>, repairFingerprint: string): string {
    return path.join(this.config.submissionRoot, 'packages', `${manifest.slug}-${manifest.version}-${repairFingerprint}.tapython-tool.zip`);
  }

  private async writeRepairedPackageArchive(manifest: TapythonToolPackageManifest, repairFingerprint: string, packageBuffer: Buffer): Promise<boolean> {
    const packageRoot = path.join(this.config.submissionRoot, 'packages');
    const packagePath = this.getRepairedPackagePath(manifest, repairFingerprint);
    await fs.mkdir(packageRoot, { recursive: true });
    try {
      await fs.access(packagePath);
      return false;
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }

    const temporaryPath = `${packagePath}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporaryPath, packageBuffer, { flag: 'wx' });
      await fs.rename(temporaryPath, packagePath);
      return true;
    } finally {
      await fs.rm(temporaryPath, { force: true });
    }
  }

  private async withPackageSubmissionLock<T>(key: string, action: () => Promise<T>): Promise<T> {
    const previous = this.packageSubmissionLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.then(() => gate);
    this.packageSubmissionLocks.set(key, tail);
    await previous;
    try {
      return await action();
    } finally {
      release();
      if (this.packageSubmissionLocks.get(key) === tail) this.packageSubmissionLocks.delete(key);
    }
  }
}

function readRawPackageForRepair(packageBuffer: Buffer): RawPackageForRepair {
  const zipEntries = readZipEntries(packageBuffer);
  const manifestEntries = Array.from(zipEntries.entries()).filter(([entryPath]) => entryPath.toLowerCase() === 'manifest.json');
  if (manifestEntries.length > 1) {
    return {
      manifest: {},
      entries: new Map(Array.from(zipEntries, ([entryPath, entry]) => [entryPath, entry.content])),
      manifestError: 'ZIP 中存在多个大小写不同的根 manifest.json。'
    };
  }
  const manifestEntry = manifestEntries[0];
  let manifest: unknown = {};
  if (manifestEntry) {
    try {
      manifest = JSON.parse(manifestEntry[1].content.toString('utf8'));
    } catch (error) {
      return {
        manifest: {},
        entries: new Map(Array.from(zipEntries, ([entryPath, entry]) => [entryPath, entry.content])),
        manifestError: error instanceof Error ? error.message : String(error)
      };
    }
  }

  return {
    manifest,
    entries: new Map(Array.from(zipEntries, ([entryPath, entry]) => [entryPath, entry.content]))
  };
}

function invalidManifestRepairReport(message: string): PackageRepairReport {
  return {
    repairable: false,
    detected: {},
    changes: [],
    issues: [{ code: 'invalid_manifest_json', level: 'error', path: 'manifest.json', message: `manifest.json 不是有效 JSON：${message}` }]
  };
}

function applyPackageSubmissionMetadata(
  manifest: TapythonToolPackageManifest,
  submitter: string,
  metadata: PackageSubmissionMetadata = {}
): TapythonToolPackageManifest {
  const author = metadata.author ?? (isGenericPackageValue(manifest.author) ? submitter : manifest.author);

  return {
    ...manifest,
    displayName: metadata.displayName ?? manifest.displayName,
    description: metadata.description ?? manifest.description,
    author,
    ownerTeam: metadata.ownerTeam ?? manifest.ownerTeam,
    category: metadata.category ?? manifest.category,
    riskLevel: metadata.riskLevel ?? manifest.riskLevel,
    tags: metadata.tags ?? manifest.tags,
    compatibility: {
      unrealEngine: metadata.unrealEngine ?? manifest.compatibility.unrealEngine,
      tapython: metadata.tapython ?? manifest.compatibility.tapython,
      plugins: metadata.plugins ?? manifest.compatibility.plugins
    },
    summary: {
      features: metadata.features ?? manifest.summary.features,
      unrealApis: metadata.unrealApis ?? manifest.summary.unrealApis,
      widgetAkas: metadata.widgetAkas ?? manifest.summary.widgetAkas,
      riskNotes: metadata.riskNotes ?? manifest.summary.riskNotes
    }
  };
}

function isGenericPackageValue(value: string): boolean {
  return /^local project$/i.test(value.trim());
}

function parseToolPackage(packageBuffer: Buffer): ParsedToolPackage {
  const entries = readZipEntries(packageBuffer);
  const manifestEntry = entries.get('manifest.json');
  if (!manifestEntry) {
    throw new Error('v2 package is missing manifest.json');
  }

  const manifest = tapythonToolPackageManifestSchema.parse(JSON.parse(manifestEntry.content.toString('utf8')));
  const issues: string[] = [];
  for (const file of manifest.files) {
    if (!isSafePackagePath(file.path)) {
      issues.push(`${file.path}: unsafe package path`);
      continue;
    }

    const entry = entries.get(file.path);
    if (!entry) {
      issues.push(`${file.path}: listed in manifest but missing from ZIP`);
      continue;
    }

    const sha256 = crypto.createHash('sha256').update(entry.content).digest('hex');
    if (sha256 !== file.sha256) {
      issues.push(`${file.path}: sha256 mismatch`);
    }
    if (entry.content.length !== file.size) {
      issues.push(`${file.path}: size mismatch`);
    }
  }

  for (const entryName of entries.keys()) {
    if (entryName !== 'manifest.json' && !isSafePackagePath(entryName)) {
      issues.push(`${entryName}: unsafe ZIP entry path`);
    }
  }

  if (issues.length > 0) {
    throw new Error(`v2 package validation failed: ${issues.join('; ')}`);
  }

  return {
    manifest,
    entries,
    packageSha256: crypto.createHash('sha256').update(packageBuffer).digest('hex')
  };
}

function buildSubmissionRequestFromPackage(parsedPackage: ParsedToolPackage, submitter: string, notes?: string): ToolSubmissionRequest {
  const manifest = parsedPackage.manifest;
  const assets: SubmissionAssetPayload[] = [];
  for (const file of manifest.files) {
    const assetPath = stripPythonPrefix(file.path);
    const entry = parsedPackage.entries.get(file.path);
    if (!entry) continue;
    assets.push({ path: assetPath, content: entry.content.toString('utf8') });
  }

  assets.push({
    path: 'MenuConfig.snippet.json',
    content: `${JSON.stringify(manifest.menuEntries, null, 2)}\n`
  });
  assets.push({
    path: 'assets/MenuConfig.snippet.json',
    content: `${JSON.stringify(manifest.menuEntries, null, 2)}\n`
  });

  return {
    slug: manifest.slug,
    submitter,
    markdown: buildMarkdownFromPackageManifest(manifest),
    assets,
    notes: [
      notes,
      `TAPython Tool Package v2 upload: ${manifest.slug}@${manifest.version}`,
      `Package SHA256: ${parsedPackage.packageSha256}`
    ].filter(Boolean).join('\n')
  };
}

function buildMarkdownFromPackageManifest(manifest: TapythonToolPackageManifest): string {
  const frontMatter = {
    schemaVersion: '1.0.0',
    slug: manifest.slug,
    name: manifest.name,
    displayName: manifest.displayName,
    version: manifest.version,
    releasedAt: manifest.releasedAt,
    updatedAt: manifest.updatedAt,
    author: manifest.author,
    ownerTeam: manifest.ownerTeam,
    status: 'pending',
    description: manifest.description,
    manifestDescription: manifest.description,
    category: manifest.category,
    toolType: manifest.toolType,
    riskLevel: manifest.riskLevel,
    sourceMode: 'v2-package-upload',
    ...(manifest.collection ? { collection: manifest.collection } : {}),
    tags: manifest.tags,
    compatibility: manifest.compatibility,
    dependencies: manifest.dependencies,
    mountPoint: manifest.install.mountPoint,
    installPath: manifest.install.targetPath,
    ...(manifest.install.entryJson ? { entryJson: manifest.install.entryJson } : {}),
    changeSummary: 'v2 package upload.',
    summary: {
      ...manifest.summary,
      installSteps: manifest.postInstallSteps
    },
    menuConfigMerge: {
      target: '<Project>/TA/TAPython/UI/MenuConfig.json',
      mountPoint: manifest.install.mountPoint,
      itemsToAdd: manifest.menuEntries
    },
    preInstallChecks: manifest.preInstallChecks,
    postInstallSteps: manifest.postInstallSteps,
    uninstallSteps: manifest.uninstallSteps,
    previousVersions: []
  };

  const body = [
    `# ${manifest.displayName}`,
    '',
    `> ${manifest.description}`,
    '',
    '## 快速开始',
    ...manifest.postInstallSteps.map((step, index) => `${index + 1}. ${step}`),
    '',
    '## 文件清单',
    '',
    '| 文件 | 用途 | 存放路径 |',
    '|------|------|----------|',
    ...manifest.files.map((file) => `| \`${path.posix.basename(file.path)}\` | ${file.role ?? 'file'} | \`${file.path}\` |`),
    '',
    '## 架构简述',
    '',
    `- 工具名称：\`${manifest.name}\``,
    `- 挂载点：\`${manifest.install.mountPoint}\``,
    `- 核心 API：${manifest.summary.unrealApis.map((api) => `\`${api}\``).join('、') || '未声明'}`,
    `- 核心控件 Aka：${manifest.summary.widgetAkas.map((aka) => `\`${aka}\``).join('、') || '未声明'}`,
    '',
    '## MenuConfig',
    '',
    '```json menuconfig path=MenuConfig.snippet.json',
    '@file:assets/MenuConfig.snippet.json',
    '```',
    '',
    ...manifest.files.flatMap((file) => buildMarkdownFileReference(file.path)),
    '## 使用说明',
    '',
    ...manifest.summary.features.map((feature, index) => `${index + 1}. ${feature}`),
    '',
    '## 注意事项',
    '',
    ...manifest.summary.riskNotes.map((note) => `- ${note}`),
    '',
    '## Agent 安装指令',
    '',
    'Agent 应以 v2 package manifest 为安装事实源，先验证 ZIP SHA256、manifest、文件 hash 和 MenuConfig 合并预览，再执行写入。',
    ''
  ].join('\n');

  return matter.stringify(body, frontMatter);
}

function buildMarkdownFileReference(packagePath: string): string[] {
  const assetPath = stripPythonPrefix(packagePath);
  const extension = path.posix.extname(assetPath).toLowerCase();
  if (extension === '.json') {
    return ['## View', '', `\`\`\`json chameleon-ui path=${assetPath}`, `@file:${assetPath}`, '```', ''];
  }
  if (extension === '.py') {
    return ['## Controller', '', `\`\`\`python controller path=${assetPath}`, `@file:${assetPath}`, '```', ''];
  }
  return [];
}

function stripPythonPrefix(packagePath: string): string {
  return packagePath.startsWith('Python/') ? packagePath.slice('Python/'.length) : packagePath;
}

function isSafePackagePath(value: string): boolean {
  if (!value || value.startsWith('/') || /^[a-zA-Z]:/.test(value)) return false;
  return value.split('/').every((segment) => segment && segment !== '.' && segment !== '..');
}

function markMarkdownApproved(markdown: string): string {
  const parsed = matter(markdown);
  return matter.stringify(parsed.content, {
    ...parsed.data,
    status: 'approved'
  });
}

async function writeSubmittedFiles(toolDocsRoot: string, request: Pick<ToolSubmissionRequest, 'slug' | 'markdown' | 'assets'>): Promise<void> {
  await fs.mkdir(toolDocsRoot, { recursive: true });
  await fs.writeFile(path.join(toolDocsRoot, `${request.slug}.md`), request.markdown, 'utf8');
  for (const asset of request.assets) {
    const assetPath = resolveInside(toolDocsRoot, asset.path);
    await fs.mkdir(path.dirname(assetPath), { recursive: true });
    await fs.writeFile(assetPath, asset.content, 'utf8');
  }
}

async function versionAlreadyPublished(toolApiRoot: string, slug: string, version: string): Promise<boolean> {
  try {
    const payload = JSON.parse(await fs.readFile(path.join(toolApiRoot, `${slug}.json`), 'utf8')) as {
      tool?: { versions?: Array<{ version: string }> };
    };
    return Boolean(payload.tool?.versions?.some((item) => item.version === version));
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function readGeneratedToolApi(apiRoot: string, requestedSlug: string): Promise<{ payload?: GeneratedToolApiPayload; generatedSlugs: string[] }> {
  try {
    const payload = JSON.parse(await fs.readFile(path.join(apiRoot, `${requestedSlug}.json`), 'utf8')) as GeneratedToolApiPayload;
    return { payload, generatedSlugs: [payload.tool?.slug ?? requestedSlug] };
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
      throw error;
    }
  }

  const generatedSlugs = await listGeneratedToolSlugs(apiRoot);
  if (generatedSlugs.length !== 1) {
    return { generatedSlugs };
  }

  const payload = JSON.parse(await fs.readFile(path.join(apiRoot, `${generatedSlugs[0]}.json`), 'utf8')) as GeneratedToolApiPayload;
  return { payload, generatedSlugs };
}

async function listGeneratedToolSlugs(apiRoot: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(apiRoot, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'index.json')
      .map((entry) => entry.name.slice(0, -'.json'.length))
      .sort();
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

function resolveInside(baseDir: string, relativePath: string): string {
  const resolvedPath = path.resolve(baseDir, relativePath);
  const resolvedBase = path.resolve(baseDir);
  if (resolvedPath !== resolvedBase && !resolvedPath.startsWith(`${resolvedBase}${path.sep}`)) {
    throw new Error(`Path escapes allowed directory: ${relativePath}`);
  }
  return resolvedPath;
}

function readZipEntries(buffer: Buffer): Map<string, ZipEntryContent> {
  if (buffer.length > MAX_PACKAGE_UPLOAD_BYTES) {
    throw new PackageResourceLimitError(`ZIP package exceeds ${MAX_PACKAGE_UPLOAD_BYTES} byte upload limit`);
  }

  const endOffset = findEndOfCentralDirectory(buffer);
  const totalEntries = buffer.readUInt16LE(endOffset + 10);
  if (totalEntries > MAX_ZIP_ENTRIES) {
    throw new PackageResourceLimitError(`ZIP has too many entries: ${totalEntries} > ${MAX_ZIP_ENTRIES}`);
  }
  const centralDirectoryOffset = buffer.readUInt32LE(endOffset + 16);
  let offset = centralDirectoryOffset;
  let totalUncompressedSize = 0;
  let actualUncompressedSize = 0;
  const entries = new Map<string, ZipEntryContent>();

  for (let index = 0; index < totalEntries; index += 1) {
    if (offset + 46 > buffer.length) {
      throw new Error(`Invalid ZIP central directory bounds at offset ${offset}`);
    }
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`Invalid ZIP central directory at offset ${offset}`);
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    if (uncompressedSize > MAX_ZIP_ENTRY_BYTES) {
      throw new PackageResourceLimitError(`ZIP entry is too large: ${uncompressedSize} > ${MAX_ZIP_ENTRY_BYTES}`);
    }
    totalUncompressedSize += uncompressedSize;
    if (totalUncompressedSize > MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES) {
      throw new PackageResourceLimitError(`ZIP total uncompressed size exceeds ${MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES} bytes`);
    }
    if (uncompressedSize > 0 && (compressedSize === 0 || uncompressedSize / compressedSize > MAX_ZIP_COMPRESSION_RATIO)) {
      throw new PackageResourceLimitError(`ZIP entry compression ratio exceeds ${MAX_ZIP_COMPRESSION_RATIO}:1`);
    }
    if (offset + 46 + fileNameLength + extraLength + commentLength > buffer.length) {
      throw new Error(`Invalid ZIP central directory entry bounds at offset ${offset}`);
    }
    const fileName = normalizeZipEntryPath(buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString('utf8'));

    if (!fileName.endsWith('/')) {
      if (entries.has(fileName)) {
        throw new Error(`ZIP contains duplicate entry: ${fileName}`);
      }
      const content = readLocalEntryContent(buffer, localHeaderOffset, compressedSize, uncompressedSize, compressionMethod);
      if (content.length > MAX_ZIP_ENTRY_BYTES) {
        throw new PackageResourceLimitError(`ZIP entry is too large: ${content.length} > ${MAX_ZIP_ENTRY_BYTES}`);
      }
      actualUncompressedSize += content.length;
      if (actualUncompressedSize > MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES) {
        throw new PackageResourceLimitError(`ZIP total uncompressed size exceeds ${MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES} bytes`);
      }
      if (content.length > 0 && (compressedSize === 0 || content.length / compressedSize > MAX_ZIP_COMPRESSION_RATIO)) {
        throw new PackageResourceLimitError(`ZIP entry compression ratio exceeds ${MAX_ZIP_COMPRESSION_RATIO}:1`);
      }
      entries.set(fileName, {
        content
      });
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function readLocalEntryContent(buffer: Buffer, localHeaderOffset: number, compressedSize: number, uncompressedSize: number, compressionMethod: number): Buffer {
  if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
    throw new Error(`Invalid ZIP local header at offset ${localHeaderOffset}`);
  }

  const fileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
  const extraLength = buffer.readUInt16LE(localHeaderOffset + 28);
  const contentOffset = localHeaderOffset + 30 + fileNameLength + extraLength;
  const compressedContent = buffer.subarray(contentOffset, contentOffset + compressedSize);

  if (compressionMethod === 0) return compressedContent;
  if (compressionMethod === 8) {
    let inflated: Buffer;
    try {
      inflated = zlib.inflateRawSync(compressedContent, { maxOutputLength: MAX_ZIP_ENTRY_BYTES + 1 });
    } catch (error) {
      if (error instanceof RangeError || (error instanceof Error && 'code' in error && error.code === 'ERR_BUFFER_TOO_LARGE')) {
        throw new PackageResourceLimitError(`ZIP entry is too large: actual output exceeds ${MAX_ZIP_ENTRY_BYTES}`);
      }
      throw error;
    }
    if (inflated.length !== uncompressedSize) {
      throw new Error(`ZIP entry size mismatch at offset ${localHeaderOffset}`);
    }
    return inflated;
  }

  throw new Error(`Unsupported ZIP compression method ${compressionMethod}`);
}

function normalizeZipEntryPath(entryName: string): string {
  return entryName.replace(/\\/g, '/');
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }

  throw new Error('Invalid ZIP: end of central directory not found');
}