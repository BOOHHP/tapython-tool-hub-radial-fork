import type { PackageRepairDecisions, PackageRepairReport, RepairedPackageSubmissionResponse, SubmissionRecord, ToolSubmissionRequest } from '@tapython-tool-hub/shared';

import { apiBaseUrl } from './apiBaseUrl';

export async function listSubmissions(): Promise<SubmissionRecord[]> {
  const response = await fetch(`${apiBaseUrl}/api/submissions`);
  if (!response.ok) {
    throw new Error(`Failed to load submissions: ${response.status}`);
  }
  const payload = await response.json() as { submissions: SubmissionRecord[] };
  return payload.submissions;
}

export async function createSubmission(payload: ToolSubmissionRequest): Promise<SubmissionRecord> {
  const response = await fetch(`${apiBaseUrl}/api/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`Failed to create submission: ${response.status}`);
  }
  return response.json() as Promise<SubmissionRecord>;
}

export async function analyzePackageRepair(file: File, decisions: PackageRepairDecisions = {}): Promise<PackageRepairReport> {
  const response = await fetch(`${apiBaseUrl}/api/submissions/package/repair?${buildRepairQuery(decisions)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/zip' },
    body: file
  });
  const payload = await readResponsePayload(response);
  if (!response.ok) {
    throw new Error(readResponseError(payload, `工具包分析失败：${response.status}`));
  }
  return payload as PackageRepairReport;
}

export async function submitRepairedPackage(file: File, submitter: string, decisions: PackageRepairDecisions = {}): Promise<RepairedPackageSubmissionResponse> {
  const query = buildRepairQuery({ ...decisions, repair: 'true', submitter });
  const response = await fetch(`${apiBaseUrl}/api/submissions/package?${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/zip' },
    body: file
  });
  const payload = await readResponsePayload(response);
  if (!response.ok && response.status !== 422) {
    throw new Error(readResponseError(payload, `修复后投稿失败：${response.status}`));
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error('修复后投稿失败：服务器未返回有效结果');
  }
  return payload as RepairedPackageSubmissionResponse;
}

function buildRepairQuery(values: PackageRepairDecisions & { repair?: string; submitter?: string }): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) query.set(key, value);
  }
  return query.toString();
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function readResponseError(payload: unknown, fallback: string): string {
  if (typeof payload === 'string' && payload.trim()) return `${fallback}：${payload.trim()}`;
  if (payload && typeof payload === 'object') {
    const errorPayload = payload as { message?: unknown; error?: unknown };
    if (typeof errorPayload.message === 'string' && errorPayload.message.trim()) return errorPayload.message;
    if (typeof errorPayload.error === 'string' && errorPayload.error.trim()) return `${fallback}：${errorPayload.error}`;
  }
  return fallback;
}


