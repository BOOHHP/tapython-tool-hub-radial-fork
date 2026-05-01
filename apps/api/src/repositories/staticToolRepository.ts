import fs from 'node:fs/promises';
import path from 'node:path';
import { toolDetailResponseSchema, toolIndexResponseSchema } from '@tapython-tool-hub/shared';
import type { ApiConfig } from '../config/env.js';

const slugPattern = /^[a-z0-9-]+$/;

export class StaticToolRepository {
  constructor(private readonly config: ApiConfig) {}

  async getIndex() {
    const payload = await this.readJson(path.join(this.config.toolApiRoot, 'index.json'));
    return toolIndexResponseSchema.parse(payload);
  }

  async getTool(slug: string) {
    if (!slugPattern.test(slug)) {
      return undefined;
    }

    try {
      const payload = await this.readJson(path.join(this.config.toolApiRoot, `${slug}.json`));
      return toolDetailResponseSchema.parse(payload);
    } catch (error) {
      if (isNotFoundError(error)) {
        return undefined;
      }
      throw error;
    }
  }

  private async readJson(filePath: string): Promise<unknown> {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  }
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}