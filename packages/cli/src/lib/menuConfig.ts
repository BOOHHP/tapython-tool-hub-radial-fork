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
  const currentItems = getMountItems(existing[mountPoint]);
  const toAdd: MenuConfigItem[] = [];
  const skipped: MenuConfigItem[] = [];

  for (const item of itemsToAdd) {
    const duplicate = currentItems.some((existing) =>
      item.ChameleonTools
        ? existing.ChameleonTools === item.ChameleonTools
        : existing.name === item.name && existing.command === item.command
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
  const existingMount = config[diff.mountPoint];
  const items = getMountItems(existingMount);
  items.push(...diff.itemsToAdd);
  config[diff.mountPoint] = Array.isArray(existingMount) ? items : { items };

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

export function removeMenuConfigItems(
  config: Record<string, unknown>,
  mountPoint: string,
  itemsToRemove: MenuConfigItem[]
): Record<string, unknown> {
  const existingMount = config[mountPoint];
  const removeKeys = new Set(itemsToRemove.map(menuItemKey));
  const items = getMountItems(existingMount).filter((item) => !removeKeys.has(menuItemKey(item)));
  return {
    ...config,
    [mountPoint]: Array.isArray(existingMount) ? items : { items }
  };
}

export function formatMenuConfigDiff(diff: MenuConfigDiff): string[] {
  const lines: string[] = [];
  lines.push(`Target: ${diff.target}`);
  lines.push(`Mount point: ${diff.mountPoint}`);
  if (diff.itemsToAdd.length > 0) {
    lines.push(`Items to add (${diff.itemsToAdd.length}):`);
    for (const item of diff.itemsToAdd) {
      lines.push(`  + ${item.name} → ${item.ChameleonTools ?? item.command}`);
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

function getMountItems(value: unknown): MenuConfigItem[] {
  if (Array.isArray(value)) {
    return [...value] as MenuConfigItem[];
  }
  if (value && typeof value === 'object' && Array.isArray((value as { items?: unknown }).items)) {
    return [...(value as { items: MenuConfigItem[] }).items];
  }
  return [];
}

function menuItemKey(item: MenuConfigItem): string {
  return item.ChameleonTools ? `chameleon:${item.ChameleonTools}` : `command:${item.name}:${item.command ?? ''}`;
}
