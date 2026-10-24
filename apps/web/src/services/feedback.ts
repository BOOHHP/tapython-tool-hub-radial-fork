import { apiBaseUrl } from './apiBaseUrl';

export type FeedbackKind = 'bug' | 'suggestion';
export type FeedbackStatus = 'open' | 'in_progress' | 'resolved' | 'wontfix';

export interface FeedbackPerson {
  openId: string;
  name: string;
  department?: string;
}

export interface FeedbackRecord {
  id: string;
  kind: FeedbackKind;
  title: string;
  body: string;
  status: FeedbackStatus;
  slug?: string;
  client?: string;
  clientVersion?: string;
  ueVersion?: string;
  author: FeedbackPerson;
  assignee?: FeedbackPerson;
  replyCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackReply {
  id: string;
  body: string;
  author: FeedbackPerson;
  staff: boolean;
  createdAt: string;
}

export interface FeedbackDetail extends FeedbackRecord {
  replies: FeedbackReply[];
}

export const feedbackKindLabels: Record<FeedbackKind, string> = { bug: '问题反馈', suggestion: '功能建议' };
export const feedbackStatusLabels: Record<FeedbackStatus, string> = { open: '待处理', in_progress: '处理中', resolved: '已解决', wontfix: '暂不处理' };
export const feedbackStatusColors: Record<FeedbackStatus, string> = { open: 'gold', in_progress: 'blue', resolved: 'green', wontfix: 'default' };

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    credentials: 'include',
    ...init,
    headers: init.body ? { 'Content-Type': 'application/json' } : undefined
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => undefined) as { message?: string; error?: string } | undefined;
    throw new Error(describeError(response.status, detail?.error, detail?.message));
  }
  return response.json() as Promise<T>;
}

function describeError(status: number, code?: string, message?: string): string {
  if (status === 401) return '请先登录';
  if (status === 429) return '提交过于频繁，请稍后再试';
  if (code === 'invalid_title') return '标题不能为空且不超过 100 字';
  if (code === 'invalid_body') return '内容不能为空且不超过限制长度';
  return message ?? code ?? `请求失败（${status}）`;
}

export const submitFeedback = (input: { kind: FeedbackKind; title: string; body: string }) =>
  call<FeedbackRecord>('/api/v1/feedback', { method: 'POST', body: JSON.stringify({ ...input, client: 'web' }) });
export const listMyFeedback = () => call<{ feedback: FeedbackRecord[] }>('/api/v1/me/feedback').then((r) => r.feedback);
export const getFeedback = (id: string) => call<FeedbackDetail>(`/api/v1/feedback/${encodeURIComponent(id)}`);
export const replyFeedback = (id: string, body: string) => call<FeedbackReply>(`/api/v1/feedback/${encodeURIComponent(id)}/replies`, { method: 'POST', body: JSON.stringify({ body }) });

export const listAdminFeedback = (filter: { status?: FeedbackStatus; kind?: FeedbackKind } = {}) => {
  const query = new URLSearchParams();
  if (filter.status) query.set('status', filter.status);
  if (filter.kind) query.set('kind', filter.kind);
  return call<{ feedback: FeedbackRecord[] }>(`/api/v1/admin/feedback${query.size ? `?${query}` : ''}`).then((r) => r.feedback);
};
export const getAdminFeedback = (id: string) => call<FeedbackDetail>(`/api/v1/admin/feedback/${encodeURIComponent(id)}`);
export const updateAdminFeedback = (id: string, changes: { status?: FeedbackStatus; assignee?: string | null }) =>
  call<FeedbackRecord>(`/api/v1/admin/feedback/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(changes) });

export const getNotificationPrefs = () => call<{ listed: boolean }>('/api/v1/me/notifications');
export const setNotificationPrefs = (listed: boolean) => call<{ listed: boolean }>('/api/v1/me/notifications', { method: 'PUT', body: JSON.stringify({ listed }) });
