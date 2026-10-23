import { apiBaseUrl } from './apiBaseUrl';
import type { HubRole } from './auth';

export interface ManagedUser {
  openId: string;
  name: string;
  email?: string;
  department?: string;
  team?: string;
  status: 'active' | 'left';
  roles: HubRole[];
  createdAt: string;
  lastLoginAt?: string;
}

export interface AliasCandidate {
  name: string;
  submissions: number;
  tools: number;
  kind?: 'person' | 'team';
  openId?: string;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    credentials: 'include',
    ...init,
    headers: init.body ? { 'Content-Type': 'application/json' } : undefined
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => undefined) as { error?: string; message?: string } | undefined;
    throw new Error(detail?.message ?? detail?.error ?? `请求失败：${response.status}`);
  }
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}

const put = (body: unknown): RequestInit => ({ method: 'PUT', body: JSON.stringify(body) });

export const listUsers = () => request<{ users: ManagedUser[] }>('/api/admin/users').then((r) => r.users);
export const setUserRoles = (openId: string, roles: HubRole[]) => request<ManagedUser>(`/api/admin/users/${encodeURIComponent(openId)}/roles`, put({ roles }));
export const setUserTeam = (openId: string, team: string | null) => request<ManagedUser>(`/api/admin/users/${encodeURIComponent(openId)}/team`, put({ team }));
export const markUserLeft = (openId: string) => request<ManagedUser>(`/api/admin/users/${encodeURIComponent(openId)}/left`, { method: 'POST' });
export const listAliasCandidates = () => request<{ candidates: AliasCandidate[] }>('/api/admin/author-aliases').then((r) => r.candidates);
export const bindAlias = (alias: string, kind: 'person' | 'team', openId?: string) => request<unknown>('/api/admin/author-aliases', put({ alias, kind, openId }));
export const unbindAlias = (alias: string) => request<void>(`/api/admin/author-aliases?alias=${encodeURIComponent(alias)}`, { method: 'DELETE' });