import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { generateToolData } from '@tapython-tool-hub/tooling';
import { toolDetailResponseSchema } from '@tapython-tool-hub/shared';
import type { AdminUpdateToolRequest } from '@tapython-tool-hub/shared';
import type { ApiConfig } from '../config/env.js';

const slugPattern = /^[a-z0-9-]+$/;

export class AdminWorkflow {
  constructor(private readonly config: ApiConfig) {}

  async updateTool(slug: string, updates: AdminUpdateToolRequest) {
    if (!slugPattern.test(slug)) {
      return undefined;
    }

    const sourcePath = await this.findToolSourcePath(slug);
    if (!sourcePath) {
      return undefined;
    }

    const parsed = matter(await fs.readFile(sourcePath, 'utf8'));
    const nextData = {
      ...parsed.data,
      ...updates,
      updatedAt: new Date().toISOString().slice(0, 10)
    };
    await fs.writeFile(sourcePath, matter.stringify(parsed.content, nextData), 'utf8');
    await this.regenerateToolData();

    const payload = JSON.parse(await fs.readFile(path.join(this.config.toolApiRoot, `${slug}.json`), 'utf8'));
    return toolDetailResponseSchema.parse(payload).tool;
  }

  private async regenerateToolData(): Promise<void> {
    await generateToolData({
      root: this.config.repoRoot,
      toolDataRoot: this.config.toolDataRoot,
      toolDocsRoot: this.config.toolDocsRoot,
      apiRoot: this.config.toolApiRoot,
      downloadRoot: this.config.downloadRoot
    });
  }

  private async findToolSourcePath(slug: string): Promise<string | undefined> {
    const markdownFiles = await listMarkdownFiles(this.config.toolDocsRoot);
    for (const filePath of markdownFiles) {
      const parsed = matter(await fs.readFile(filePath, 'utf8'));
      if (parsed.data.slug === slug) {
        return filePath;
      }
    }
    return undefined;
  }
}

async function listMarkdownFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listMarkdownFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(entryPath);
    }
  }

  return files;
}
