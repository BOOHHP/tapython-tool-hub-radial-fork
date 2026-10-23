import { apiBaseUrl } from './apiBaseUrl';
import type { HubUser } from './auth';

export interface MyProfile {
  user: HubUser & { team?: string };
  aliases: string[];
  claimable: Array<{ name: string; submissions: number; tools: number }>;
  tools: Array<{ slug: string; name: string; latestVersion: string | null; versions: number; downloads: number }>;
  submissions: Array<{ id: string; slug: string; status: string; updatedAt: string }>;
  reviews: { total: number; recent: Array<{ slug: string; decision: string; createdAt: string }> };
}

export class NotSignedInError extends Error {}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    credentials: 'include',
    ...init,
    headers: init.body ? { 'Content-Type': 'application/json' } : undefined
  });
  if (response.status === 401) {
    throw new NotSignedInError();
  }
  if (!response.ok) {
    const detail = await response.json().catch(() => undefined) as { message?: string; error?: string } | undefined;
    throw new Error(detail?.message ?? detail?.error ?? `请求失败：${response.status}`);
  }
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}

export const getProfile = () => call<MyProfile>('/api/v1/me/profile');
export const mergeFavorites = (slugs: string[]) => call<{ slugs: string[] }>('/api/v1/me/favorites/merge', { method: 'POST', body: JSON.stringify({ slugs }) }).then((r) => r.slugs);
export const addFavorite = (slug: string) => call<void>(`/api/v1/me/favorites/${encodeURIComponent(slug)}`, { method: 'PUT' });
export const removeFavorite = (slug: string) => call<void>(`/api/v1/me/favorites/${encodeURIComponent(slug)}`, { method: 'DELETE' });
export const claimAlias = (alias: string) => call<void>('/api/v1/me/aliases', { method: 'POST', body: JSON.stringify({ alias }) });
export const releaseAlias = (alias: string) => call<void>(`/api/v1/me/aliases?alias=${encodeURIComponent(alias)}`, { method: 'DELETE' });