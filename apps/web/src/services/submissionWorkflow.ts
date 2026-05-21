import type { SubmissionRecord, ToolSubmissionRequest } from '@tapython-tool-hub/shared';

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


