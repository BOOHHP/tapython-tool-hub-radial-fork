import path from 'node:path';
import fs from 'node:fs/promises';

export function expandInstallPath(template: string, projectRoot: string): string {
  const expanded = template.replace(/<Project>/g, projectRoot);
  return path.resolve(expanded);
}

export function resolveInside(baseDir: string, relativePath: string): string {
  const resolved = path.resolve(baseDir, relativePath);
  const resolvedBase = path.resolve(baseDir);
  if (resolved !== resolvedBase && !resolved.startsWith(`${resolvedBase}${path.sep}`)) {
    throw new Error(`Path escapes allowed directory: ${relativePath}`);
  }
  return resolved;
}

export async function detectTAPythonDir(projectRoot: string): Promise<{ exists: boolean; path: string }> {
  const tapythonPath = path.join(projectRoot, 'TA', 'TAPython');
  try {
    await fs.access(tapythonPath);
    return { exists: true, path: tapythonPath };
  } catch {
    return { exists: false, path: tapythonPath };
  }
}

export async function checkFileWritable(filePath: string): Promise<{ exists: boolean; writable: boolean }> {
  try {
    await fs.access(filePath);
    try {
      await fs.access(filePath, fs.constants.W_OK);
      return { exists: true, writable: true };
    } catch {
      return { exists: true, writable: false };
    }
  } catch {
    return { exists: false, writable: true };
  }
}
