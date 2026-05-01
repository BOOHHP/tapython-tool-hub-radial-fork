import fs from 'node:fs/promises';
import path from 'node:path';
import type { MenuConfigItem } from '@tapython-tool-hub/shared';

export interface MenuConfigDiff {
  target: string;
  mountPoint: string;
  itemsToAdd: MenuConfigItem[];
  itemsSkipped: MenuConfigItem[];
}

export async function readMenuConfig(filePath: string): Promise<Record<string, unknown>> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const stripped = content.replace(/^\uFEFF/, '');
    return JSON.parse(stripped) as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

export function planMenuConfigMerge(
  existing: Record<string, unknown>,
  itemsToAdd: MenuConfigItem[],
  mountPoint: string,
  target: string
): MenuConfigDiff {
  const currentItems = (existing[mountPoint] ?? []) as Array<Record<string, string>>;
  const toAdd: MenuConfigItem[] = [];
  const skipped: MenuConfigItem[] = [];

  for (const item of itemsToAdd) {
    const duplicate = currentItems.some(
      (existing) => existing.ChameleonTools === item.ChameleonTools
    );
    if (duplicate) {
      skipped.push(item);
    } else {
      toAdd.push(item);
    }
  }

  return { target, mountPoint, itemsToAdd: toAdd, itemsSkipped: skipped };
}

export async function applyMenuConfigMerge(filePath: string, diff: MenuConfigDiff): Promise<void> {
  const config = await readMenuConfig(filePath);
  const items = (config[diff.mountPoint] ?? []) as unknown[];
  items.push(...diff.itemsToAdd);
  config[diff.mountPoint] = items;

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

export function formatMenuConfigDiff(diff: MenuConfigDiff): string[] {
  const lines: string[] = [];
  lines.push(`Target: ${diff.target}`);
  lines.push(`Mount point: ${diff.mountPoint}`);
  if (diff.itemsToAdd.length > 0) {
    lines.push(`Items to add (${diff.itemsToAdd.length}):`);
    for (const item of diff.itemsToAdd) {
      lines.push(`  + ${item.name} → ${item.ChameleonTools}`);
    }
  }
  if (diff.itemsSkipped.length > 0) {
    lines.push(`Items already present (${diff.itemsSkipped.length}):`);
    for (const item of diff.itemsSkipped) {
      lines.push(`  = ${item.name} (skipped)`);
    }
  }
  return lines;
}
