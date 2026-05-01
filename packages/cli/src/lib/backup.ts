import fs from 'node:fs/promises';

export async function backupFile(filePath: string): Promise<string | null> {
  try {
    await fs.access(filePath);
  } catch {
    return null;
  }
  const timestamp = Date.now();
  const backupPath = `${filePath}.bak.${timestamp}`;
  await fs.copyFile(filePath, backupPath);
  return backupPath;
}
