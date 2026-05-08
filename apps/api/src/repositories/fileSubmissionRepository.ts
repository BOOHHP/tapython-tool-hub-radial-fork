import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { submissionRecordSchema } from '@tapython-tool-hub/shared';
import type { SubmissionRecord, ToolSubmissionRequest, ValidationReport } from '@tapython-tool-hub/shared';
import type { ApiConfig } from '../config/env.js';
import type { SubmissionRepository } from './submissionRepository.js';

const idPattern = /^[a-f0-9-]+$/;

export class FileSubmissionRepository implements SubmissionRepository {
  constructor(private readonly config: ApiConfig) {}

  async list(): Promise<SubmissionRecord[]> {
    await fs.mkdir(this.config.submissionRoot, { recursive: true });
    const fileNames = await fs.readdir(this.config.submissionRoot);
    const submissions = await Promise.all(
      fileNames
        .filter((fileName) => fileName.endsWith('.json'))
        .map((fileName) => this.read(path.join(this.config.submissionRoot, fileName)))
    );
    return submissions.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async get(id: string): Promise<SubmissionRecord | undefined> {
    if (!idPattern.test(id)) {
      return undefined;
    }

    try {
      return await this.read(this.getPath(id));
    } catch (error) {
      if (isNotFoundError(error)) {
        return undefined;
      }
      throw error;
    }
  }

  async create(request: ToolSubmissionRequest, validationReport: ValidationReport): Promise<SubmissionRecord> {
    const now = new Date().toISOString();
    const submission: SubmissionRecord = {
      id: crypto.randomUUID(),
      slug: request.slug,
      submitter: request.submitter,
      status: validationReport.valid ? 'pending' : 'draft',
      markdown: request.markdown,
      assets: request.assets,
      notes: request.notes,
      validationReport,
      reviews: [],
      createdAt: now,
      updatedAt: now
    };

    await this.save(submission);
    return submission;
  }

  async save(submission: SubmissionRecord): Promise<SubmissionRecord> {
    await fs.mkdir(this.config.submissionRoot, { recursive: true });
    const next = submissionRecordSchema.parse({ ...submission, updatedAt: new Date().toISOString() });
    await fs.writeFile(this.getPath(next.id), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    return next;
  }

  async delete(id: string): Promise<boolean> {
    if (!idPattern.test(id)) {
      return false;
    }

    try {
      await fs.rm(this.getPath(id));
      return true;
    } catch (error) {
      if (isNotFoundError(error)) {
        return false;
      }
      throw error;
    }
  }

  private async read(filePath: string): Promise<SubmissionRecord> {
    return submissionRecordSchema.parse(JSON.parse(await fs.readFile(filePath, 'utf8')));
  }

  private getPath(id: string): string {
    return path.join(this.config.submissionRoot, `${id}.json`);
  }
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}