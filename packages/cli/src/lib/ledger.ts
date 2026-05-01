import fs from 'node:fs/promises';
import path from 'node:path';

export interface InstalledFile {
  path: string;
  sha256: string;
  backup?: string;
}

export interface InstalledMenuConfigEntry {
  target: string;
  mountPoint: string;
  itemsAdded: Array<{ name: string; ChameleonTools: string; ExtensionHookName: string }>;
  backup?: string;
}

export interface InstalledToolRecord {
  slug: string;
  displayName: string;
  version: string;
  installedAt: string;
  installDir: string;
  files: InstalledFile[];
  menuConfig: InstalledMenuConfigEntry;
  hub?: string;
}

export interface InstallLedger {
  schemaVersion: string;
  tools: InstalledToolRecord[];
}

const LEDGER_DIR = '.tool-hub';
const LEDGER_FILE = 'installed.json';

export function getLedgerPath(projectRoot: string): string {
  return path.join(projectRoot, 'TA', 'TAPython', LEDGER_DIR, LEDGER_FILE);
}

export async function readLedger(projectRoot: string): Promise<InstallLedger> {
  const ledgerPath = getLedgerPath(projectRoot);
  try {
    const content = await fs.readFile(ledgerPath, 'utf8');
    return JSON.parse(content) as InstallLedger;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { schemaVersion: '1.0.0', tools: [] };
    }
    throw error;
  }
}

export async function writeLedger(projectRoot: string, ledger: InstallLedger): Promise<void> {
  const ledgerPath = getLedgerPath(projectRoot);
  await fs.mkdir(path.dirname(ledgerPath), { recursive: true });
  await fs.writeFile(ledgerPath, JSON.stringify(ledger, null, 2) + '\n', 'utf8');
}

export function findInstalledTool(ledger: InstallLedger, slug: string): InstalledToolRecord | undefined {
  return ledger.tools.find(t => t.slug === slug);
}

export function addToolToLedger(ledger: InstallLedger, record: InstalledToolRecord): void {
  const existingIdx = ledger.tools.findIndex(t => t.slug === record.slug);
  if (existingIdx >= 0) {
    ledger.tools[existingIdx] = record;
  } else {
    ledger.tools.push(record);
  }
}

export function removeToolFromLedger(ledger: InstallLedger, slug: string): InstalledToolRecord | undefined {
  const idx = ledger.tools.findIndex(t => t.slug === slug);
  if (idx < 0) return undefined;
  return ledger.tools.splice(idx, 1)[0];
}
