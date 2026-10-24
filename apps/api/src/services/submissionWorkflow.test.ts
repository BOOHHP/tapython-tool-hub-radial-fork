import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import zlib from 'node:zlib';
import { tapythonToolPackageManifestSchema } from '@tapython-tool-hub/shared';
import type { ToolSubmissionRequest } from '@tapython-tool-hub/shared';
import type { ApiConfig } from '../config/env.js';
import { FileSubmissionRepository } from '../repositories/fileSubmissionRepository.js';
import { SubmissionWorkflow } from './submissionWorkflow.js';

test('stores invalid submissions as drafts with validation errors', async () => {
  const context = await createContext();
  try {
    const submission = await context.workflow.createSubmission({
      slug: 'broken-tool',
      submitter: 'QA Team',
      markdown: '# Missing front matter',
      assets: []
    });

    assert.equal(submission.status, 'draft');
    assert.equal(submission.validationReport.valid, false);
    assert.match(submission.validationReport.issues[0]?.message ?? '', /missing required front matter field/i);
  } finally {
    await context.cleanup();
  }
});

test('blocks approving an already published slug and version', async () => {
  const context = await createContext();
  try {
    await fs.mkdir(context.config.toolApiRoot, { recursive: true });
    await fs.writeFile(
      path.join(context.config.toolApiRoot, 'phase-f-existing.json'),
      `${JSON.stringify({ tool: { versions: [{ version: '1.0.0' }] } })}\n`,
      'utf8'
    );

    const submission = await context.workflow.createSubmission(validSubmission('phase-f-existing', '1.0.0'));

    assert.equal(submission.status, 'draft');
    assert.equal(submission.validationReport.valid, false);
    assert.equal(submission.validationReport.issues[0]?.path, 'version');
    assert.match(submission.validationReport.issues[0]?.message ?? '', /已发布版本不可变|已发布/);
  } finally {
    await context.cleanup();
  }
});

test('serializes approval and revalidates duplicate pending versions', async () => {
  const context = await createContext();
  try {
    const first = await context.workflow.createSubmission(validSubmission('approval-race-tool', '1.0.0', 'pending'));
    const second = await context.workflow.createSubmission(validSubmission('approval-race-tool', '1.0.0', 'pending'));

    const results = await Promise.allSettled([
      context.workflow.reviewSubmission(first.id, { reviewer: 'Reviewer A', decision: 'approved' }),
      context.workflow.reviewSubmission(second.id, { reviewer: 'Reviewer B', decision: 'approved' })
    ]);

    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
    const submissions = await context.repository.list();
    assert.equal(submissions.filter((submission) => submission.status === 'approved').length, 1);
    assert.equal(submissions.filter((submission) => !submission.validationReport.valid).length, 1);
  } finally {
    await context.cleanup();
  }
});

test('reports a clear validation error when request slug differs from markdown slug', async () => {
  const context = await createContext();
  try {
    const request = validSubmission('markdown-slug', '1.0.0');
    const submission = await context.workflow.createSubmission({
      ...request,
      slug: 'form-slug'
    });

    assert.equal(submission.status, 'draft');
    assert.equal(submission.validationReport.valid, false);
    assert.equal(submission.validationReport.issues[0]?.path, 'slug');
    assert.match(submission.validationReport.issues[0]?.message ?? '', /form-slug.*markdown-slug|slug.*不一致/);
  } finally {
    await context.cleanup();
  }
});

test('reports a clear validation error when request tool type differs from markdown tool type', async () => {
  const context = await createContext();
  try {
    const request = validPythonScriptSubmission('type-mismatch-script', '1.0.0');
    const submission = await context.workflow.createSubmission({
      ...request,
      toolType: 'chameleon'
    });

    assert.equal(submission.status, 'draft');
    assert.equal(submission.validationReport.valid, false);
    assert.equal(submission.validationReport.issues[0]?.path, 'toolType');
    assert.match(submission.validationReport.issues[0]?.message ?? '', /chameleon.*python-script|toolType.*不一致/i);
  } finally {
    await context.cleanup();
  }
});

test('ignores package README markdown assets during validation', async () => {
  const context = await createContext();
  try {
    const submission = await context.workflow.createSubmission({
      ...validSubmission('readme-asset-tool', '1.0.0'),
      assets: [
        {
          path: 'SceneTools/README.md',
          content: '# SceneTools\n\nPackage usage notes without tool front matter.\n'
        }
      ]
    });

    assert.equal(submission.status, 'pending');
    assert.equal(submission.validationReport.valid, true, JSON.stringify(submission.validationReport.issues));
  } finally {
    await context.cleanup();
  }
});

test('accepts ToolHub generated v2 packages as package submissions', async () => {
  const sourceContext = await createContext();
  const targetContext = await createContext();
  try {
    const slug = 'roundtrip-package-tool';
    const sourceSubmission = await sourceContext.workflow.createSubmission(validSubmissionWithAssets(slug, '1.0.0'));
    await sourceContext.workflow.reviewSubmission(sourceSubmission.id, {
      reviewer: 'TA Reviewer',
      decision: 'approved'
    });

    const packageBuffer = await fs.readFile(path.join(sourceContext.config.downloadRoot, slug, '1.0.0', `${slug}-1.0.0.zip`));
    const packageSubmission = await targetContext.workflow.createPackageSubmission({
      packageBuffer,
      submitter: 'QA Team',
      notes: 'Round-trip package upload coverage.',
      metadata: {
        author: 'CC',
        ownerTeam: 'CC',
        category: 'asset-management',
        riskLevel: 'low',
        unrealEngine: ['5.5'],
        tapython: ['1.2+'],
        plugins: ['TAPython'],
        tags: ['texture', 'duplicate'],
        features: ['扫描指定路径下所有纹理资产，按文件名分组'],
        unrealApis: ['unreal.AssetRegistryHelpers.get_asset_registry'],
        widgetAkas: ['GroupList'],
        riskNotes: ['本工具仅执行只读扫描。']
      }
    });

    assert.equal(packageSubmission.status, 'pending');
    assert.equal(packageSubmission.slug, slug);
    assert.equal(packageSubmission.validationReport.valid, true, JSON.stringify(packageSubmission.validationReport.issues));
    assert.match(packageSubmission.markdown, /sourceMode: v2-package-upload/);
    assert.match(packageSubmission.markdown, /^author: CC$/m);
    assert.match(packageSubmission.markdown, /^ownerTeam: CC$/m);
    assert.match(packageSubmission.markdown, /^category: asset-management$/m);
    assert.match(packageSubmission.markdown, /unreal\.AssetRegistryHelpers\.get_asset_registry/);
    assert.match(packageSubmission.markdown, /GroupList/);

    await targetContext.workflow.reviewSubmission(packageSubmission.id, {
      reviewer: 'TA Reviewer',
      decision: 'approved'
    });

    const generatedManifest = JSON.parse(await fs.readFile(path.join(targetContext.config.downloadRoot, slug, '1.0.0', 'manifest.json'), 'utf8')) as {
      packageType?: string;
      slug?: string;
      install?: { entryJson?: string };
      menuEntries?: unknown[];
    };
    assert.equal(generatedManifest.packageType, 'TAPythonToolPackage');
    assert.equal(generatedManifest.slug, slug);
    assert.equal(generatedManifest.install?.entryJson, 'RoundtripPackageTool/RoundtripPackageTool.json');
    assert.equal(generatedManifest.menuEntries?.length, 1);
  } finally {
    await sourceContext.cleanup();
    await targetContext.cleanup();
  }
});

test('preserves Collection metadata through package submission and publishing', async () => {
  const context = await createContext();
  try {
    const packageBuffer = collectionShellPackage();
    const submission = await context.workflow.createPackageSubmission({ packageBuffer, submitter: 'Scene C' });
    assert.equal(submission.status, 'pending', JSON.stringify(submission.validationReport.issues));
    assert.match(submission.markdown, /^collection:/m);

    await context.workflow.reviewSubmission(submission.id, { reviewer: 'TA Reviewer', decision: 'approved' });

    const manifest = JSON.parse(await fs.readFile(path.join(context.config.downloadRoot, 'collection-shell-fixture', '1.0.0', 'manifest.json'), 'utf8')) as {
      collection?: { id?: string; role?: string; uiKind?: string };
    };
    assert.deepEqual(manifest.collection, {
      id: 'ue-python-toolkit',
      role: 'shell',
      uiKind: 'tkinter-shell'
    });
    assert.equal(tapythonToolPackageManifestSchema.safeParse({
      ...manifest,
      slug: 'invalid-module-fixture',
      collection: { id: 'ue-python-toolkit', role: 'module', moduleId: 'invalid_module' }
    }).success, false, 'module Collection metadata requires category, Shell version and source hash');
    assert.equal(tapythonToolPackageManifestSchema.safeParse({
      ...manifest,
      slug: 'valid-module-fixture',
      collection: {
        id: 'ue-python-toolkit',
        role: 'module',
        moduleId: 'valid_module',
        categoryPath: ['8_开发测试', '2_只读查询'],
        requiredShellVersion: '1.0.0',
        sourceSha256: 'a'.repeat(64)
      }
    }).success, true);

    const detail = JSON.parse(await fs.readFile(path.join(context.config.toolApiRoot, 'collection-shell-fixture.json'), 'utf8')) as {
      tool?: { collection?: { id?: string; role?: string } };
    };
    assert.equal(detail.tool?.collection?.id, 'ue-python-toolkit');
    assert.equal(detail.tool?.collection?.role, 'shell');

    const index = JSON.parse(await fs.readFile(path.join(context.config.toolApiRoot, 'index.json'), 'utf8')) as {
      tools?: Array<{ slug?: string; collection?: { id?: string; role?: string } }>;
    };
    const indexed = index.tools?.find((tool) => tool.slug === 'collection-shell-fixture');
    assert.equal(indexed?.collection?.id, 'ue-python-toolkit');
    assert.equal(indexed?.collection?.role, 'shell');
  } finally {
    await context.cleanup();
  }
});

test('repairs a malformed AI package before creating the submission', async () => {
  const sourceContext = await createContext();
  const targetContext = await createContext();
  const blockedContext = await createContext();
  const failureContext = await createContext();
  const concurrentContext = await createContext();
  try {
    const slug = 'ai-repair-script';
    const sourceSubmission = await sourceContext.workflow.createSubmission(validPythonScriptSubmission(slug, '1.0.0'));
    await sourceContext.workflow.reviewSubmission(sourceSubmission.id, {
      reviewer: 'TA Reviewer',
      decision: 'approved'
    });

    const packagePath = path.join(sourceContext.config.downloadRoot, slug, '1.0.0', `${slug}-1.0.0.tapython-tool.zip`);
    const malformedPackage = replaceStoredZipText(
      await fs.readFile(packagePath),
      '"formatVersion": 2',
      '"formatVersion": 1'
    );

    const preview = targetContext.workflow.analyzePackageRepair({ packageBuffer: malformedPackage });
    assert.equal(preview.repairable, true, JSON.stringify(preview.issues));
    assert.ok(preview.changes.some((change) => change.path === 'formatVersion'));

    const repaired = await targetContext.workflow.createRepairedPackageSubmission({
      packageBuffer: malformedPackage,
      submitter: 'QA Team'
    });
    assert.ok(repaired.submission);
    assert.equal(repaired.submission?.status, 'pending', JSON.stringify(repaired.submission?.validationReport.issues));
    assert.equal(repaired.repairReport.repairable, true);
    assert.match(repaired.submission?.notes ?? '', /Package repair:/);

    const retried = await targetContext.workflow.createRepairedPackageSubmission({
      packageBuffer: malformedPackage,
      submitter: 'QA Team'
    });
    assert.equal(retried.submission?.id, repaired.submission?.id);
    assert.equal((await targetContext.repository.list()).length, 1);

    const conflicting = await targetContext.workflow.createRepairedPackageSubmission({
      packageBuffer: malformedPackage,
      submitter: 'QA Team',
      command: 'import SelectionAuditScript; SelectionAuditScript.run_strict()'
    });
    assert.equal(conflicting.submission, undefined);
    assert.ok(conflicting.repairReport.issues.some((issue) => issue.code === 'pending_submission_conflict'));

    const concurrent = await Promise.all([
      concurrentContext.workflow.createRepairedPackageSubmission({ packageBuffer: malformedPackage, submitter: 'QA Team' }),
      concurrentContext.workflow.createRepairedPackageSubmission({ packageBuffer: malformedPackage, submitter: 'QA Team' })
    ]);
    assert.equal(concurrent[0].submission?.id, concurrent[1].submission?.id);
    assert.equal((await concurrentContext.repository.list()).length, 1);

    const invalidManifestPackage = replaceStoredZipText(
      await fs.readFile(packagePath),
      '{\n  "formatVersion"',
      '!\n  "formatVersion"'
    );
    const invalidManifest = targetContext.workflow.analyzePackageRepair({ packageBuffer: invalidManifestPackage });
    assert.equal(invalidManifest.repairable, false);
    assert.ok(invalidManifest.issues.some((issue) => issue.code === 'invalid_manifest_json'));

    const duplicateManifest = targetContext.workflow.analyzePackageRepair({
      packageBuffer: zipWithStoredEntries([
        ['manifest.json', Buffer.from('{}')],
        ['MANIFEST.JSON', Buffer.from('{}')],
        ['Python/DuplicateManifest/__init__.py', Buffer.from('')]
      ])
    });
    assert.equal(duplicateManifest.repairable, false);
    assert.ok(duplicateManifest.issues.some((issue) => issue.code === 'invalid_manifest_json'));

    await fs.mkdir(blockedContext.config.toolApiRoot, { recursive: true });
    await fs.writeFile(
      path.join(blockedContext.config.toolApiRoot, `${slug}.json`),
      `${JSON.stringify({ tool: { versions: [{ version: '1.0.0' }] } })}\n`,
      'utf8'
    );
    const blocked = await blockedContext.workflow.createRepairedPackageSubmission({
      packageBuffer: malformedPackage,
      submitter: 'QA Team'
    });
    assert.equal(blocked.submission, undefined);
    assert.equal(blocked.repairReport.repairable, false);
    assert.ok(blocked.repairReport.issues.some((issue) => issue.code === 'submission_validation_failed'));
    assert.equal((await blockedContext.repository.list()).length, 0);

    await fs.mkdir(failureContext.config.submissionRoot, { recursive: true });
    await fs.writeFile(path.join(failureContext.config.submissionRoot, 'packages'), 'blocks package directory creation', 'utf8');
    await assert.rejects(
      failureContext.workflow.createRepairedPackageSubmission({ packageBuffer: malformedPackage, submitter: 'QA Team' }),
      /EEXIST|not a directory/i
    );
    assert.equal((await failureContext.repository.list()).length, 0);
  } finally {
    await sourceContext.cleanup();
    await targetContext.cleanup();
    await blockedContext.cleanup();
    await failureContext.cleanup();
    await concurrentContext.cleanup();
  }
});

test('preserves published version history when approving a repaired new version', async () => {
  const sourceContext = await createContext();
  const targetContext = await createContext();
  try {
    const slug = 'repair-history-tool';
    const firstSubmission = await targetContext.workflow.createSubmission(validPythonScriptSubmission(slug, '1.0.0'));
    await targetContext.workflow.reviewSubmission(firstSubmission.id, { reviewer: 'TA Reviewer', decision: 'approved' });

    const secondSubmission = await sourceContext.workflow.createSubmission(validPythonScriptSubmission(slug, '2.0.0'));
    await sourceContext.workflow.reviewSubmission(secondSubmission.id, { reviewer: 'TA Reviewer', decision: 'approved' });
    const packageBuffer = await fs.readFile(path.join(sourceContext.config.downloadRoot, slug, '2.0.0', `${slug}-2.0.0.tapython-tool.zip`));

    const repaired = await targetContext.workflow.createRepairedPackageSubmission({ packageBuffer, submitter: 'QA Team' });
    assert.ok(repaired.submission, JSON.stringify(repaired.repairReport.issues));
    await targetContext.workflow.reviewSubmission(repaired.submission!.id, { reviewer: 'TA Reviewer', decision: 'approved' });

    const apiPayload = JSON.parse(await fs.readFile(path.join(targetContext.config.toolApiRoot, `${slug}.json`), 'utf8')) as {
      tool?: { versions?: Array<{ version?: string }> };
    };
    assert.deepEqual(apiPayload.tool?.versions?.map((version) => version.version), ['2.0.0', '1.0.0']);
  } finally {
    await sourceContext.cleanup();
    await targetContext.cleanup();
  }
});

test('rejects repair packages that exceed ZIP resource limits', async () => {
  const sourceContext = await createContext();
  const targetContext = await createContext();
  try {
    const slug = 'repair-resource-limits';
    const sourceSubmission = await sourceContext.workflow.createSubmission(validPythonScriptSubmission(slug, '1.0.0'));
    await sourceContext.workflow.reviewSubmission(sourceSubmission.id, {
      reviewer: 'TA Reviewer',
      decision: 'approved'
    });
    const packageBuffer = await fs.readFile(path.join(
      sourceContext.config.downloadRoot,
      slug,
      '1.0.0',
      `${slug}-1.0.0.tapython-tool.zip`
    ));

    assert.throws(
      () => targetContext.workflow.analyzePackageRepair({ packageBuffer: patchZipEntryCount(packageBuffer, 257) }),
      /too many entries/i
    );
    assert.throws(
      () => targetContext.workflow.analyzePackageRepair({ packageBuffer: patchZipEntrySizes(packageBuffer, [6 * 1024 * 1024]) }),
      /entry is too large/i
    );
    assert.throws(
      () => targetContext.workflow.analyzePackageRepair({ packageBuffer: patchZipEntrySizes(packageBuffer, [4 * 1024 * 1024, 4 * 1024 * 1024, 4 * 1024 * 1024], 4 * 1024 * 1024) }),
      /total uncompressed size/i
    );
    assert.throws(
      () => targetContext.workflow.analyzePackageRepair({ packageBuffer: patchZipEntrySizes(packageBuffer, [1024 * 1024], 1) }),
      /compression ratio/i
    );
    assert.throws(
      () => targetContext.workflow.analyzePackageRepair({ packageBuffer: zipWithDeflatedOutput(6 * 1024 * 1024, 1) }),
      /entry is too large/i
    );
  } finally {
    await sourceContext.cleanup();
    await targetContext.cleanup();
  }
});

test('uses the package mount point when a v2 menu entry omits ExtensionHookName', async () => {
  const sourceContext = await createContext();
  const targetContext = await createContext();
  try {
    const slug = 'legacy-menu-entry-tool';
    const sourceSubmission = await sourceContext.workflow.createSubmission(validSubmissionWithAssets(slug, '1.0.0'));
    await sourceContext.workflow.reviewSubmission(sourceSubmission.id, {
      reviewer: 'TA Reviewer',
      decision: 'approved'
    });

    const generatedPackage = await fs.readFile(path.join(sourceContext.config.downloadRoot, slug, '1.0.0', `${slug}-1.0.0.zip`));
    const packageBuffer = removeExtensionHookName(generatedPackage);
    const packageSubmission = await targetContext.workflow.createPackageSubmission({
      packageBuffer,
      submitter: 'QA Team'
    });

    assert.equal(packageSubmission.status, 'pending');
    assert.match(packageSubmission.markdown, /ExtensionHookName: OnToolBarChameleon/);
  } finally {
    await sourceContext.cleanup();
    await targetContext.cleanup();
  }
});

test('records rejected reviews without publishing artifacts', async () => {
  const context = await createContext();
  try {
    const submission = await context.workflow.createSubmission(validSubmission('phase-f-rejected', '1.0.0'));
    const reviewed = await context.workflow.reviewSubmission(submission.id, {
      reviewer: 'TA Reviewer',
      decision: 'rejected',
      comment: 'Needs clearer risk notes.'
    });

    assert.equal(reviewed?.status, 'rejected');
    assert.equal(reviewed?.reviews[0]?.decision, 'rejected');
    await assert.rejects(
      fs.readFile(path.join(context.config.toolApiRoot, 'phase-f-rejected.json'), 'utf8'),
      /ENOENT/
    );
  } finally {
    await context.cleanup();
  }
});

test('publishes compatible API and downloads after approval', async () => {
  const context = await createContext();
  try {
    const submission = await context.workflow.createSubmission(validSubmission('phase-f-published', '1.0.0', 'pending'));
    const reviewed = await context.workflow.reviewSubmission(submission.id, {
      reviewer: 'TA Reviewer',
      decision: 'approved'
    });

    assert.equal(reviewed?.status, 'approved');
    assert.equal(reviewed?.reviews[0]?.decision, 'approved');

    const toolDoc = await fs.readFile(path.join(context.config.toolDocsRoot, 'phase-f-published', 'phase-f-published.md'), 'utf8');
    assert.match(toolDoc, /Phase F Published/);
    assert.match(toolDoc, /^status: approved$/m);

    const apiPayload = JSON.parse(await fs.readFile(path.join(context.config.toolApiRoot, 'phase-f-published.json'), 'utf8')) as {
      tool?: { slug?: string; status?: string };
    };
    assert.equal(apiPayload.tool?.slug, 'phase-f-published');
    assert.equal(apiPayload.tool?.status, 'approved');

    const readme = await fs.readFile(path.join(context.config.downloadRoot, 'phase-f-published', '1.0.0', 'README.md'), 'utf8');
    assert.match(readme, /Phase F Published/);
  } finally {
    await context.cleanup();
  }
});

test('fires notification hooks for submit, review and listing, and survives a throwing hook', async () => {
  const context = await createContext();
  try {
    const events: string[] = [];
    const workflow = new SubmissionWorkflow(context.config, context.repository, undefined, {
      onSubmitted: (submission) => { events.push(`submitted:${submission.slug}`); },
      onReviewed: (_submission, review) => { events.push(`reviewed:${review.decision}`); throw new Error('bot down'); },
      onListed: (submission) => { events.push(`listed:${submission.slug}`); }
    });

    const draft = await workflow.createSubmission({ ...validSubmission('hook-draft', '1.0.0', 'pending'), markdown: 'not a tool doc' });
    assert.equal(draft.status, 'draft');
    assert.deepEqual(events, []);

    const submission = await workflow.createSubmission(validSubmission('hook-tool', '1.0.0', 'pending'));
    const reviewed = await workflow.reviewSubmission(submission.id, { reviewer: 'TA Reviewer', decision: 'approved' });
    assert.equal(reviewed?.status, 'approved');
    assert.deepEqual(events, ['submitted:hook-tool', 'reviewed:approved', 'listed:hook-tool']);
  } finally {
    await context.cleanup();
  }
});

test('publishes a pure python script without a chameleon entry json', async () => {
  const context = await createContext();
  const targetContext = await createContext();
  try {
    const submission = await context.workflow.createSubmission(validPythonScriptSubmission('selection-audit-script', '1.0.0'));

    assert.equal(submission.status, 'pending', JSON.stringify(submission.validationReport.issues));
    assert.equal(submission.validationReport.valid, true, JSON.stringify(submission.validationReport.issues));

    await context.workflow.reviewSubmission(submission.id, {
      reviewer: 'TA Reviewer',
      decision: 'approved'
    });

    const apiPayload = JSON.parse(await fs.readFile(path.join(context.config.toolApiRoot, 'selection-audit-script.json'), 'utf8')) as {
      tool?: {
        toolType?: string;
        entryJson?: string;
        mountPoint?: string;
        versions?: Array<{ manifest?: { menuConfigMerge?: { itemsToAdd?: Array<{ command?: string }> } } }>;
      };
    };
    assert.equal(apiPayload.tool?.toolType, 'python-script');
    assert.equal(apiPayload.tool?.entryJson, undefined);
    assert.equal(apiPayload.tool?.mountPoint, 'OnToolbar');
    assert.equal(
      apiPayload.tool?.versions?.[0]?.manifest?.menuConfigMerge?.itemsToAdd?.[0]?.command,
      'import SelectionAuditScript; SelectionAuditScript.run()'
    );

    const packageManifest = JSON.parse(await fs.readFile(
      path.join(context.config.downloadRoot, 'selection-audit-script', '1.0.0', 'manifest.json'),
      'utf8'
    )) as {
      toolType?: string;
      install?: { entryJson?: string; mountPoint?: string };
      menuEntries?: Array<{ command?: string; ChameleonTools?: string }>;
    };
    assert.equal(packageManifest.toolType, 'python-script');
    assert.equal(packageManifest.install?.entryJson, undefined);
    assert.equal(packageManifest.install?.mountPoint, 'OnToolbar');
    assert.equal(packageManifest.menuEntries?.[0]?.command, 'import SelectionAuditScript; SelectionAuditScript.run()');
    assert.equal(packageManifest.menuEntries?.[0]?.ChameleonTools, undefined);
    assert.equal(tapythonToolPackageManifestSchema.safeParse({
      ...packageManifest,
      install: { ...packageManifest.install, entryJson: 'SelectionAuditScript/SelectionAuditScript.json' }
    }).success, false, 'python-script packages must not declare install.entryJson');
    assert.equal(tapythonToolPackageManifestSchema.safeParse({
      ...packageManifest,
      files: []
    }).success, false, 'v2 packages must declare at least one installable file');

    const packageBuffer = await fs.readFile(path.join(
      context.config.downloadRoot,
      'selection-audit-script',
      '1.0.0',
      'selection-audit-script-1.0.0.tapython-tool.zip'
    ));
    const packageSubmission = await targetContext.workflow.createPackageSubmission({
      packageBuffer,
      submitter: 'QA Team'
    });
    assert.equal(packageSubmission.status, 'pending', JSON.stringify(packageSubmission.validationReport.issues));
    assert.match(packageSubmission.markdown, /^toolType: python-script$/m);
    assert.doesNotMatch(packageSubmission.markdown, /^entryJson:/m);
  } finally {
    await context.cleanup();
    await targetContext.cleanup();
  }
});

async function createContext(): Promise<{ config: ApiConfig; repository: FileSubmissionRepository; workflow: SubmissionWorkflow; cleanup: () => Promise<void> }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tapython-tool-hub-test-'));
  const config: ApiConfig = {
    host: '127.0.0.1',
    port: 0,
    repoRoot: root,
    toolDataRoot: path.join(root, 'data', 'tools'),
    toolDocsRoot: path.join(root, 'data', 'tool-docs'),
    toolApiRoot: path.join(root, 'public', 'api', 'tools'),
    downloadRoot: path.join(root, 'public', 'downloads'),
    submissionRoot: path.join(root, 'submissions'),
    serveStatic: false,
    webStaticRoot: path.join(root, 'dist')
  };

  const repository = new FileSubmissionRepository(config);
  return {
    config,
    repository,
    workflow: new SubmissionWorkflow(config, repository),
    cleanup: () => fs.rm(root, { recursive: true, force: true })
  };
}

function validSubmission(slug: string, version: string, status = 'approved'): ToolSubmissionRequest {
  const displayName = toDisplayName(slug);
  return {
    slug,
    submitter: 'QA Team',
    assets: [],
    markdown: `---
schemaVersion: "1.0.0"
slug: ${slug}
name: ${toPascalCase(slug)}
displayName: ${displayName}
version: "${version}"
releasedAt: "2026-05-01"
updatedAt: "2026-05-01"
author: QA Team
ownerTeam: QA
status: ${status}
description: ${displayName} submission test.
category: qa
riskLevel: low
sourceMode: markdown-first
tags: [qa, submission]
compatibility:
  unrealEngine: ["5.4"]
  tapython: ["1.2+"]
  plugins: ["TAPython"]
dependencies: []
mountPoint: OnToolBarChameleon
installPath: <Project>/TA/TAPython/Python/${toPascalCase(slug)}/
entryJson: ${toPascalCase(slug)}/${toPascalCase(slug)}.json
changeSummary: Initial submission.
summary:
  features:
    - Submission workflow coverage
  unrealApis: []
  widgetAkas: []
  installSteps:
    - Copy ${toPascalCase(slug)} folder.
  riskNotes: []
menuConfigMerge:
  target: <Project>/TA/TAPython/UI/MenuConfig.json
  mountPoint: OnToolBarChameleon
  itemsToAdd:
    - name: ${displayName}
      ChameleonTools: ../Python/${toPascalCase(slug)}/${toPascalCase(slug)}.json
      ExtensionHookName: OnToolBarChameleon
preInstallChecks: []
postInstallSteps: []
uninstallSteps: []
---

# ${displayName}

## 快速开始

1. Copy ${toPascalCase(slug)} folder.
`
  };
}

function validSubmissionWithAssets(slug: string, version: string): ToolSubmissionRequest {
  const request = validSubmission(slug, version);
  const toolName = toPascalCase(slug);
  const codeFence = '```';
  return {
    ...request,
    assets: [
      {
        path: `${toolName}/${toolName}.json`,
        content: `${JSON.stringify({ TabLabel: toDisplayName(slug), Root: { type: 'SVerticalBox' } }, null, 2)}\n`
      },
      {
        path: `${toolName}/${toolName}.py`,
        content: `class ${toolName}Controller:\n    pass\n`
      }
    ],
    markdown: [
      request.markdown,
      '## View',
      '',
      `${codeFence}json chameleon-ui path=${toolName}/${toolName}.json`,
      `@file:${toolName}/${toolName}.json`,
      codeFence,
      '',
      '## Controller',
      '',
      `${codeFence}python controller path=${toolName}/${toolName}.py`,
      `@file:${toolName}/${toolName}.py`,
      codeFence,
      ''
    ].join('\n')
  };
}

function removeExtensionHookName(packageBuffer: Buffer): Buffer {
  const original = Buffer.from('"ExtensionHookName": "OnToolBarChameleon"', 'utf8');
  const replacement = Buffer.from('"ignored"          : "OnToolBarChameleon"', 'utf8');
  assert.equal(replacement.length, original.length);

  const result = Buffer.from(packageBuffer);
  const offset = result.indexOf(original);
  assert.notEqual(offset, -1);
  replacement.copy(result, offset);
  return result;
}

function toPascalCase(value: string): string {
  return value.split('-').map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join('');
}

function toDisplayName(value: string): string {
  return value.split('-').map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(' ');
}

function validPythonScriptSubmission(slug: string, version: string): ToolSubmissionRequest {
  const displayName = toDisplayName(slug);
  return {
    slug,
    submitter: 'QA Team',
    assets: [
      {
        path: 'SelectionAuditScript/__init__.py',
        content: 'from .selection_audit import run\n'
      },
      {
        path: 'SelectionAuditScript/selection_audit.py',
        content: 'def run():\n    print("Selection audit complete")\n'
      }
    ],
    markdown: `---
schemaVersion: "1.0.0"
slug: ${slug}
name: SelectionAuditScript
displayName: ${displayName}
version: "${version}"
releasedAt: "2026-08-31"
updatedAt: "2026-08-31"
author: QA Team
ownerTeam: QA
status: pending
description: Pure Python selection audit command.
category: validation
toolType: python-script
riskLevel: low
sourceMode: markdown-first
tags: [python, selection, audit]
compatibility:
  unrealEngine: ["5.5"]
  tapython: ["1.2+"]
  plugins: ["TAPython"]
dependencies: []
mountPoint: OnToolbar
installPath: <Project>/TA/TAPython/Python/SelectionAuditScript/
changeSummary: Initial pure Python script.
summary:
  features:
    - Run a selection audit command.
  unrealApis: []
  widgetAkas: []
  installSteps:
    - Copy the Python package and merge the toolbar command.
  riskNotes: []
menuConfigMerge:
  target: <Project>/TA/TAPython/UI/MenuConfig.json
  mountPoint: OnToolbar
  itemsToAdd:
    - name: ${displayName}
      command: import SelectionAuditScript; SelectionAuditScript.run()
preInstallChecks: []
postInstallSteps: []
uninstallSteps: []
---

# ${displayName}

## 快速开始

1. Run the command from the TAPython Python toolbar.

## Script

\`\`\`python controller path=SelectionAuditScript/selection_audit.py
@file:SelectionAuditScript/selection_audit.py
\`\`\`
`
  };
}

function replaceStoredZipText(packageBuffer: Buffer, from: string, to: string): Buffer {
  const original = Buffer.from(from, 'utf8');
  const replacement = Buffer.from(to, 'utf8');
  assert.equal(replacement.length, original.length);

  const result = Buffer.from(packageBuffer);
  const offset = result.indexOf(original);
  assert.notEqual(offset, -1);
  replacement.copy(result, offset);
  return result;
}

function patchZipEntryCount(packageBuffer: Buffer, count: number): Buffer {
  const result = Buffer.from(packageBuffer);
  const endOffset = findZipEndOffset(result);
  result.writeUInt16LE(count, endOffset + 8);
  result.writeUInt16LE(count, endOffset + 10);
  return result;
}

function patchZipEntrySizes(packageBuffer: Buffer, uncompressedSizes: number[], compressedSize?: number): Buffer {
  const result = Buffer.from(packageBuffer);
  const endOffset = findZipEndOffset(result);
  const totalEntries = result.readUInt16LE(endOffset + 10);
  let offset = result.readUInt32LE(endOffset + 16);

  for (let index = 0; index < totalEntries && index < uncompressedSizes.length; index += 1) {
    assert.equal(result.readUInt32LE(offset), 0x02014b50);
    if (compressedSize !== undefined) result.writeUInt32LE(compressedSize, offset + 20);
    result.writeUInt32LE(uncompressedSizes[index], offset + 24);
    offset += 46 + result.readUInt16LE(offset + 28) + result.readUInt16LE(offset + 30) + result.readUInt16LE(offset + 32);
  }

  return result;
}

function findZipEndOffset(buffer: Buffer): number {
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error('Invalid ZIP fixture');
}

function zipWithDeflatedOutput(actualSize: number, declaredSize: number): Buffer {
  const fileName = Buffer.from('manifest.json', 'utf8');
  const compressed = zlib.deflateRawSync(Buffer.alloc(actualSize, 0x41));
  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0x0800, 6);
  localHeader.writeUInt16LE(8, 8);
  localHeader.writeUInt32LE(compressed.length, 18);
  localHeader.writeUInt32LE(declaredSize, 22);
  localHeader.writeUInt16LE(fileName.length, 26);

  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(0x0800, 8);
  centralHeader.writeUInt16LE(8, 10);
  centralHeader.writeUInt32LE(compressed.length, 20);
  centralHeader.writeUInt32LE(declaredSize, 24);
  centralHeader.writeUInt16LE(fileName.length, 28);

  const centralDirectory = Buffer.concat([centralHeader, fileName]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localHeader.length + fileName.length + compressed.length, 16);
  return Buffer.concat([localHeader, fileName, compressed, centralDirectory, end]);
}

function zipWithStoredEntries(entries: Array<[string, Buffer]>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const [entryPath, content] of entries) {
    const fileName = Buffer.from(entryPath, 'utf8');
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(fileName.length, 26);
    localParts.push(localHeader, fileName, content);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt32LE(content.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(fileName.length, 28);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(centralHeader, fileName);
    localOffset += localHeader.length + fileName.length + content.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function collectionShellPackage(): Buffer {
  const runtime = Buffer.from('def launch():\n    return None\n', 'utf8');
  const runtimePath = 'Python/CollectionShellFixture/runtime.py';
  const manifest = {
    formatVersion: 2,
    packageType: 'TAPythonToolPackage',
    schemaVersion: '1.0.0',
    slug: 'collection-shell-fixture',
    name: 'CollectionShellFixture',
    displayName: 'Collection Shell Fixture',
    version: '1.0.0',
    releasedAt: '2026-10-08',
    author: 'Scene C',
    ownerTeam: 'Scene C',
    description: 'Collection contract fixture.',
    category: 'pipeline',
    toolType: 'python-script',
    riskLevel: 'low',
    tags: ['collection'],
    compatibility: { unrealEngine: ['5.5'], tapython: ['1.2+'], plugins: ['TAPython'] },
    dependencies: [],
    install: {
      pythonRoot: 'Python/CollectionShellFixture',
      targetPath: '<Project>/TA/TAPython/Python/CollectionShellFixture',
      mountPoint: 'OnToolbar'
    },
    files: [{ path: runtimePath, sha256: crypto.createHash('sha256').update(runtime).digest('hex'), size: runtime.length, role: 'python' }],
    menuEntries: [{ name: 'Collection Shell Fixture', command: 'import CollectionShellFixture; CollectionShellFixture.launch()' }],
    hotkeyEntries: {},
    externalJson: [],
    summary: { features: ['Collection fixture'], unrealApis: [], widgetAkas: [], riskNotes: [] },
    preInstallChecks: [],
    postInstallSteps: [],
    uninstallSteps: [],
    createdAt: '2026-10-08T00:00:00Z',
    updatedAt: '2026-10-08T00:00:00Z',
    collection: { id: 'ue-python-toolkit', role: 'shell', uiKind: 'tkinter-shell' }
  };
  return zipWithStoredEntries([
    ['manifest.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8')],
    [runtimePath, runtime]
  ]);
}