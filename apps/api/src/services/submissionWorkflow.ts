import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateToolData } from '@tapython-tool-hub/tooling';
import type { ReviewRecord, ReviewSubmissionRequest, SubmissionRecord, ToolSubmissionRequest, ValidationIssue, ValidationReport } from '@tapython-tool-hub/shared';
import type { ApiConfig } from '../config/env.js';
import type { SubmissionRepository } from '../repositories/submissionRepository.js';

export class SubmissionWorkflow {
  constructor(
    private readonly config: ApiConfig,
    private readonly repository: SubmissionRepository
  ) {}

  async createSubmission(request: ToolSubmissionRequest): Promise<SubmissionRecord> {
    const validationReport = await this.validate(request);
    return this.repository.create(request, validationReport);
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
      if (!submission.validationReport.valid) {
        throw new Error('Cannot approve a submission with failed validation.');
      }
      await this.publish(submission);
      submission.status = 'approved';
    } else if (request.decision === 'rejected') {
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

      const generatedTool = JSON.parse(await fs.readFile(path.join(apiRoot, `${request.slug}.json`), 'utf8')) as {
        tool?: { versions?: Array<{ version: string }> };
      };
      const submittedVersion = generatedTool.tool?.versions?.[0]?.version;
      if (submittedVersion && await versionAlreadyPublished(this.config.toolApiRoot, request.slug, submittedVersion)) {
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
    await writeSubmittedFiles(path.join(this.config.toolDocsRoot, submission.slug), submission);
    await generateToolData({
      root: this.config.repoRoot,
      toolDataRoot: this.config.toolDataRoot,
      toolDocsRoot: this.config.toolDocsRoot,
      apiRoot: this.config.toolApiRoot,
      downloadRoot: this.config.downloadRoot
    });
  }
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

function resolveInside(baseDir: string, relativePath: string): string {
  const resolvedPath = path.resolve(baseDir, relativePath);
  const resolvedBase = path.resolve(baseDir);
  if (resolvedPath !== resolvedBase && !resolvedPath.startsWith(`${resolvedBase}${path.sep}`)) {
    throw new Error(`Path escapes allowed directory: ${relativePath}`);
  }
  return resolvedPath;
}