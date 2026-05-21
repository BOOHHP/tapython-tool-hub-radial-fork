import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
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

async function createContext(): Promise<{ config: ApiConfig; workflow: SubmissionWorkflow; cleanup: () => Promise<void> }> {
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

function toPascalCase(value: string): string {
  return value.split('-').map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join('');
}

function toDisplayName(value: string): string {
  return value.split('-').map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(' ');
}