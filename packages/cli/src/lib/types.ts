export class CliError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly exitCode: number = 1
  ) {
    super(message);
  }
}

export type OutputMode = 'human' | 'json';

export interface CommandContext {
  json: boolean;
  args: string[];
  flags: Record<string, string | boolean | undefined>;
}

export interface FilePlanEntry {
  path: string;
  action: 'add' | 'overwrite' | 'skip';
  backup?: string;
}

export interface InstallPlan {
  tool: { slug: string; displayName: string; version: string };
  downloads: { manifest: string; package: string; readme: string; markdown?: string };
  checks: {
    hashValid: boolean;
    pathExists: boolean;
    tapythonDirExists: boolean;
    menuConfigWritable: boolean;
  };
  filePlan: FilePlanEntry[];
  menuConfigDiff: { target: string; mountPoint: string; itemsToAdd: unknown[] };
  warnings: string[];
  nextCommand: string;
  nextHumanStep: string;
}
