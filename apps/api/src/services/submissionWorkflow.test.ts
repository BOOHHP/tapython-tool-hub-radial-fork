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
    submissionRoot: path.join(root, 'submissions')
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

function toPascalCase(value: string): string {
  return value.split('-').map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join('');
}

function toDisplayName(value: string): string {
  return value.split('-').map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(' ');
}