import { z } from 'zod';

export const riskLevelSchema = z.enum(['low', 'medium', 'high']);
export const toolStatusSchema = z.enum(['draft', 'pending', 'approved', 'rejected', 'deprecated', 'archived']);
export const submissionStatusSchema = z.enum(['draft', 'pending', 'approved', 'rejected']);
export const reviewDecisionSchema = z.enum(['approved', 'rejected', 'changes_requested']);

export const compatibilitySchema = z.object({
  unrealEngine: z.array(z.string()),
  tapython: z.array(z.string()),
  plugins: z.array(z.string())
});

export const toolFileManifestSchema = z.object({
  path: z.string(),
  sha256: z.string(),
  size: z.number().int().nonnegative()
});

export const menuConfigItemSchema = z.object({
  name: z.string(),
  ChameleonTools: z.string(),
  ExtensionHookName: z.string()
});

export const toolManifestSchema = z.object({
  schemaVersion: z.string(),
  name: z.string(),
  displayName: z.string(),
  version: z.string(),
  author: z.string(),
  description: z.string(),
  category: z.string(),
  tags: z.array(z.string()),
  compatibility: compatibilitySchema,
  dependencies: z.array(z.string()),
  mountPoint: z.string(),
  installPath: z.string(),
  entryJson: z.string(),
  riskLevel: riskLevelSchema,
  files: z.array(toolFileManifestSchema),
  menuConfigMerge: z.object({
    target: z.string(),
    mountPoint: z.string(),
    itemsToAdd: z.array(menuConfigItemSchema)
  }),
  preInstallChecks: z.array(z.string()),
  postInstallSteps: z.array(z.string()),
  uninstallSteps: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const toolVersionSchema = z.object({
  version: z.string(),
  releasedAt: z.string(),
  author: z.string(),
  changeSummary: z.string(),
  breaking: z.boolean(),
  downloads: z.object({
    manifest: z.string(),
    readme: z.string(),
    markdown: z.string().optional(),
    package: z.string(),
    packageSha256: z.string().optional(),
    packageSize: z.number().int().nonnegative().optional(),
    packageAvailable: z.boolean().optional(),
    packageUnavailableReason: z.string().optional()
  }),
  manifest: toolManifestSchema
});

export const toolRecordSchema = z.object({
  slug: z.string(),
  name: z.string(),
  displayName: z.string(),
  description: z.string(),
  category: z.string(),
  author: z.string(),
  ownerTeam: z.string(),
  status: toolStatusSchema,
  riskLevel: riskLevelSchema,
  tags: z.array(z.string()),
  compatibility: compatibilitySchema,
  mountPoint: z.string(),
  installPath: z.string(),
  entryJson: z.string(),
  sourceDocument: z.string(),
  sourceMode: z.string().optional(),
  updatedAt: z.string(),
  downloads: z.object({
    latestManifest: z.string(),
    latestReadme: z.string(),
    latestMarkdown: z.string().optional(),
    latestPackage: z.string(),
    latestPackageSha256: z.string().optional(),
    latestPackageSize: z.number().int().nonnegative().optional(),
    latestPackageAvailable: z.boolean().optional(),
    latestPackageUnavailableReason: z.string().optional()
  }),
  summary: z.object({
    features: z.array(z.string()),
    unrealApis: z.array(z.string()),
    widgetAkas: z.array(z.string()),
    installSteps: z.array(z.string()),
    riskNotes: z.array(z.string())
  }),
  documentationMarkdown: z.string().optional(),
  versions: z.array(toolVersionSchema)
});

export const toolIndexRecordSchema = toolRecordSchema.pick({
  slug: true,
  name: true,
  displayName: true,
  description: true,
  category: true,
  author: true,
  ownerTeam: true,
  status: true,
  riskLevel: true,
  tags: true,
  compatibility: true,
  mountPoint: true,
  installPath: true,
  sourceDocument: true,
  sourceMode: true,
  downloads: true
}).extend({
  latestVersion: z.string(),
  apiUrl: z.string()
});

export const toolIndexResponseSchema = z.object({
  schemaVersion: z.string(),
  generatedAt: z.string(),
  total: z.number().int().nonnegative(),
  tools: z.array(toolIndexRecordSchema)
});

export const toolDetailResponseSchema = z.object({
  schemaVersion: z.string(),
  generatedAt: z.string(),
  tool: toolRecordSchema
});

export const submissionAssetPayloadSchema = z.object({
  path: z.string().min(1),
  content: z.string()
});

export const toolSubmissionRequestSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  submitter: z.string().min(1),
  markdown: z.string().min(1),
  assets: z.array(submissionAssetPayloadSchema),
  notes: z.string().optional()
});

export const validationIssueSchema = z.object({
  level: z.enum(['error', 'warning']),
  message: z.string(),
  path: z.string().optional()
});

export const validationReportSchema = z.object({
  valid: z.boolean(),
  issues: z.array(validationIssueSchema),
  generatedToolCount: z.number().int().nonnegative().optional()
});

export const reviewRecordSchema = z.object({
  id: z.string(),
  reviewer: z.string(),
  decision: reviewDecisionSchema,
  comment: z.string().optional(),
  createdAt: z.string()
});

export const submissionRecordSchema = z.object({
  id: z.string(),
  slug: z.string(),
  submitter: z.string(),
  status: submissionStatusSchema,
  markdown: z.string(),
  assets: z.array(submissionAssetPayloadSchema),
  notes: z.string().optional(),
  validationReport: validationReportSchema,
  reviews: z.array(reviewRecordSchema),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const submissionListResponseSchema = z.object({
  schemaVersion: z.string(),
  generatedAt: z.string(),
  total: z.number().int().nonnegative(),
  submissions: z.array(submissionRecordSchema)
});

export const reviewSubmissionRequestSchema = z.object({
  reviewer: z.string().min(1),
  decision: reviewDecisionSchema,
  comment: z.string().optional()
});