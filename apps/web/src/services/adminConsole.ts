import type { AdminUpdateToolRequest, ReviewSubmissionRequest, SubmissionRecord, ToolRecord } from '@tapython-tool-hub/shared';

import { apiBaseUrl } from './apiBaseUrl';

export async function listAdminSubmissions(): Promise<SubmissionRecord[]> {
  const response = await fetch(`${apiBaseUrl}/api/admin/submissions`);
  if (!response.ok) {
    throw new Error(`Failed to load admin submissions: ${response.status}`);
  }
  const payload = await response.json() as { submissions: SubmissionRecord[] };
  return payload.submissions;
}

export async function reviewAdminSubmission(id: string, payload: ReviewSubmissionRequest): Promise<SubmissionRecord> {
  const response = await fetch(`${apiBaseUrl}/api/admin/submissions/${id}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => undefined) as { message?: string } | undefined;
    throw new Error(errorPayload?.message ?? `Failed to review submission: ${response.status}`);
  }
  return response.json() as Promise<SubmissionRecord>;
}

export async function deleteAdminSubmission(id: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/admin/submissions/${id}`, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(`Failed to delete submission: ${response.status}`);
  }
}

export async function updateAdminTool(slug: string, payload: AdminUpdateToolRequest): Promise<ToolRecord> {
  const response = await fetch(`${apiBaseUrl}/api/admin/tools/${slug}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`Failed to update tool: ${response.status}`);
  }
  return response.json() as Promise<ToolRecord>;
}
