import { z } from 'zod';
import type { MenuConfigItem, ToolType } from './types.js';

export const riskLevelSchema = z.enum(['low', 'medium', 'high']);
export const toolTypeSchema = z.enum(['chameleon', 'python-script']);
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

export const tapythonToolPackageFileSchema = z.object({
  path: z.string().refine(isSafePackagePath, 'file path must be a safe relative Windows path'),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  size: z.number().int().nonnegative(),
  role: z.string().optional()
});

export const menuConfigItemSchema: z.ZodType<MenuConfigItem> = z.lazy(() => z.object({
  name: z.string(),
  ChameleonTools: z.string().optional(),
  command: z.string().optional(),
  ExtensionHookName: z.string().optional(),
  items: z.array(menuConfigItemSchema).optional()
}).passthrough().superRefine((item, ctx) => {
    if (Boolean(item.ChameleonTools) === Boolean(item.command)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'menu entry requires exactly one of "ChameleonTools" (chameleon tool) or "command" (python script)'
      });
    }
  }));

export const tapythonToolPackageInstallSchema = z.object({
  pythonRoot: z.string().refine(isSafePackagePath, 'pythonRoot must be a safe relative Windows path'),
  targetPath: z.string().refine(isSafeProjectTargetPath, 'targetPath must stay inside <Project> using safe Windows path segments'),
  entryJson: z.string().refine(isSafePackagePath, 'entryJson must be a safe relative Windows path').optional(),
  mountPoint: z.string()
});

export const tapythonToolPackageSummarySchema = z.object({
  features: z.array(z.string()),
  unrealApis: z.array(z.string()),
  widgetAkas: z.array(z.string()),
  riskNotes: z.array(z.string())
});

export const toolCollectionMetadataSchema = z.discriminatedUnion('role', [
  z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    role: z.literal('shell'),
    uiKind: z.string().min(1).optional()
  }).strict(),
  z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    role: z.literal('module'),
    moduleId: z.string().regex(/^[a-z0-9_-]+$/),
    categoryPath: z.array(z.string().min(1)).min(1),
    requiredShellVersion: z.string().min(1),
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/)
  }).strict()
]);

export const tapythonToolPackageManifestSchema = z.object({
  formatVersion: z.literal(2),
  packageType: z.literal('TAPythonToolPackage'),
  schemaVersion: z.string(),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  displayName: z.string(),
  version: z.string(),
  releasedAt: z.string(),
  author: z.string(),
  ownerTeam: z.string(),
  description: z.string(),
  category: z.string(),
  toolType: toolTypeSchema.default('chameleon'),
  riskLevel: riskLevelSchema,
  tags: z.array(z.string()),
  compatibility: compatibilitySchema,
  dependencies: z.array(z.string()),
  install: tapythonToolPackageInstallSchema,
  files: z.array(tapythonToolPackageFileSchema).min(1, 'v2 packages require at least one installable file'),
  menuEntries: z.array(menuConfigItemSchema),
  hotkeyEntries: z.record(z.unknown()),
  externalJson: z.array(z.string()),
  summary: tapythonToolPackageSummarySchema,
  preInstallChecks: z.array(z.string()),
  postInstallSteps: z.array(z.string()),
  uninstallSteps: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  collection: toolCollectionMetadataSchema.optional()
}).superRefine((manifest, ctx) => {
  if (manifest.toolType === 'chameleon' && !manifest.install.entryJson) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['install', 'entryJson'], message: 'chameleon tools require install.entryJson' });
  }
  if (manifest.toolType === 'python-script' && manifest.install.entryJson) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['install', 'entryJson'], message: 'python scripts must not declare install.entryJson' });
  }
  validateMenuToolType(manifest.menuEntries, manifest.toolType, ctx, ['menuEntries']);
}).transform((manifest) => ({
  ...manifest,
  menuEntries: manifest.menuEntries.map((entry) => ({
    ...entry,
    ExtensionHookName: entry.ExtensionHookName ?? manifest.install.mountPoint
  }))
}));

function isSafePackagePath(value: string): boolean {
  return Boolean(value) && !value.startsWith('/') && !/^[a-zA-Z]:/.test(value) && value.replace(/\\/g, '/').split('/').every(isSafeWindowsPathSegment);
}

function validateMenuToolType(entries: MenuConfigItem[], toolType: ToolType, ctx: z.RefinementCtx, pathPrefix: Array<string | number>): void {
  entries.forEach((entry, index) => {
    const entryPath = [...pathPrefix, index];
    if (toolType === 'chameleon' && !entry.ChameleonTools) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: entryPath, message: 'chameleon tools require ChameleonTools menu entries' });
    }
    if (toolType === 'python-script' && !entry.command) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: entryPath, message: 'python scripts require command menu entries' });
    }
    if (entry.items) validateMenuToolType(entry.items, toolType, ctx, [...entryPath, 'items']);
  });
}

function isSafeProjectTargetPath(value: string): boolean {
  const normalized = value.replace(/\\/g, '/').replace(/\/$/, '');
  return normalized.startsWith('<Project>/') && normalized.slice('<Project>/'.length).split('/').every(isSafeWindowsPathSegment);
}

function isSafeWindowsPathSegment(segment: string): boolean {
  if (!segment || segment === '.' || segment === '..' || /[<>:"|?*\x00-\x1f]/.test(segment) || /[. ]$/.test(segment)) return false;
  const stem = segment.split('.')[0];
  return !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem);
}

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
  entryJson: z.string().optional(),
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
  updatedAt: z.string(),
  collection: toolCollectionMetadataSchema.optional()
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
  toolType: toolTypeSchema.default('chameleon'),
  tags: z.array(z.string()),
  compatibility: compatibilitySchema,
  mountPoint: z.string(),
  installPath: z.string(),
  entryJson: z.string().optional(),
  sourceDocument: z.string(),
  sourceMode: z.string().optional(),
  updatedAt: z.string(),
  collection: toolCollectionMetadataSchema.optional(),
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
  toolType: true,
  tags: true,
  compatibility: true,
  mountPoint: true,
  installPath: true,
  sourceDocument: true,
  sourceMode: true,
  collection: true,
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
  toolType: toolTypeSchema.optional(),
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

export const adminUpdateToolRequestSchema = z.object({
  displayName: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  ownerTeam: z.string().min(1).optional(),
  status: toolStatusSchema.optional(),
  riskLevel: riskLevelSchema.optional(),
  tags: z.array(z.string().min(1)).optional()
});