import type { ReviewSubmissionRequest, SubmissionRecord, ToolSubmissionRequest } from '@tapython-tool-hub/shared';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8787';

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

export async function reviewSubmission(id: string, payload: ReviewSubmissionRequest): Promise<SubmissionRecord> {
  const response = await fetch(`${apiBaseUrl}/api/submissions/${id}/review`, {
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