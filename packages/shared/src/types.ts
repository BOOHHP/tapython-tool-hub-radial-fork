export type RiskLevel = 'low' | 'medium' | 'high';
export type ToolStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'deprecated' | 'archived';
export type SubmissionStatus = 'draft' | 'pending' | 'approved' | 'rejected';
export type ReviewDecision = 'approved' | 'rejected' | 'changes_requested';

export interface Compatibility {
  unrealEngine: string[];
  tapython: string[];
  plugins: string[];
}

export interface ToolFileManifest {
  path: string;
  sha256: string;
  size: number;
}

export interface MenuConfigItem {
  name: string;
  ChameleonTools: string;
  ExtensionHookName: string;
}

export interface ToolManifest {
  schemaVersion: string;
  name: string;
  displayName: string;
  version: string;
  author: string;
  description: string;
  category: string;
  tags: string[];
  compatibility: Compatibility;
  dependencies: string[];
  mountPoint: string;
  installPath: string;
  entryJson: string;
  riskLevel: RiskLevel;
  files: ToolFileManifest[];
  menuConfigMerge: {
    target: string;
    mountPoint: string;
    itemsToAdd: MenuConfigItem[];
  };
  preInstallChecks: string[];
  postInstallSteps: string[];
  uninstallSteps: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ToolVersion {
  version: string;
  releasedAt: string;
  author: string;
  changeSummary: string;
  breaking: boolean;
  downloads: {
    manifest: string;
    readme: string;
    markdown?: string;
    package: string;
    packageSha256?: string;
    packageSize?: number;
    packageAvailable?: boolean;
    packageUnavailableReason?: string;
  };
  manifest: ToolManifest;
}

export interface ToolRecord {
  slug: string;
  name: string;
  displayName: string;
  description: string;
  category: string;
  author: string;
  ownerTeam: string;
  status: ToolStatus;
  riskLevel: RiskLevel;
  tags: string[];
  compatibility: Compatibility;
  mountPoint: string;
  installPath: string;
  entryJson: string;
  sourceDocument: string;
  sourceMode?: string;
  updatedAt: string;
  downloads: {
    latestManifest: string;
    latestReadme: string;
    latestMarkdown?: string;
    latestPackage: string;
    latestPackageSha256?: string;
    latestPackageSize?: number;
    latestPackageAvailable?: boolean;
    latestPackageUnavailableReason?: string;
  };
  summary: {
    features: string[];
    unrealApis: string[];
    widgetAkas: string[];
    installSteps: string[];
    riskNotes: string[];
  };
  documentationMarkdown?: string;
  versions: ToolVersion[];
}

export interface ManifestDiffRow {
  key: string;
  label: string;
  fromValue: string;
  toValue: string;
  changed: boolean;
}

export interface FileDiffRow {
  path: string;
  status: 'added' | 'removed' | 'modified' | 'unchanged';
  fromHash: string;
  toHash: string;
  fromSize?: number;
  toSize?: number;
}

export interface SubmissionAssetPayload {
  path: string;
  content: string;
}

export interface ToolSubmissionRequest {
  slug: string;
  submitter: string;
  markdown: string;
  assets: SubmissionAssetPayload[];
  notes?: string;
}

export interface ValidationIssue {
  level: 'error' | 'warning';
  message: string;
  path?: string;
}

export interface ValidationReport {
  valid: boolean;
  issues: ValidationIssue[];
  generatedToolCount?: number;
}

export interface ReviewRecord {
  id: string;
  reviewer: string;
  decision: ReviewDecision;
  comment?: string;
  createdAt: string;
}

export interface SubmissionRecord {
  id: string;
  slug: string;
  submitter: string;
  status: SubmissionStatus;
  markdown: string;
  assets: SubmissionAssetPayload[];
  notes?: string;
  validationReport: ValidationReport;
  reviews: ReviewRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface ReviewSubmissionRequest {
  reviewer: string;
  decision: ReviewDecision;
  comment?: string;
}