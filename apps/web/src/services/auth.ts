import { apiBaseUrl } from './apiBaseUrl';

export interface AuthUser {
  username: string;
}

export interface AuthState {
  authenticated: boolean;
  user?: AuthUser;
}

export async function getCurrentAdmin(): Promise<AuthState> {
  const response = await fetch(`${apiBaseUrl}/api/auth/me`, { credentials: 'include' });
  if (response.status === 401) {
    return { authenticated: false };
  }
  if (!response.ok) {
    throw new Error(`Failed to load admin session: ${response.status}`);
  }
  return response.json() as Promise<AuthState>;
}

export async function loginAdmin(username: string, password: string): Promise<AuthState> {
  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  if (!response.ok) {
    throw new Error(response.status === 401 ? '用户名或密码不正确' : `Failed to login: ${response.status}`);
  }
  return response.json() as Promise<AuthState>;
}

export async function logoutAdmin(): Promise<void> {
  await fetch(`${apiBaseUrl}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include'
  });
}
export type HubRole = 'reviewer' | 'admin';

export interface HubUser {
  openId: string;
  name: string;
  email?: string;
  department?: string;
  roles: HubRole[];
}

export interface HubSession {
  authenticated: boolean;
  user?: HubUser;
}

export const canReview = (user?: HubUser) => Boolean(user?.roles.some((role) => role === 'reviewer' || role === 'admin'));
export const isHubAdmin = (user?: HubUser) => Boolean(user?.roles.includes('admin'));

export async function isFeishuLoginEnabled(): Promise<boolean> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/v1/auth/config`);
    return response.ok && Boolean(((await response.json()) as { enabled?: boolean }).enabled);
  } catch {
    return false;
  }
}

// Feishu sign-in is optional; any failure just means "not signed in".
export async function getHubSession(): Promise<HubSession> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/v1/auth/me`, { credentials: 'include' });
    return response.ok ? ((await response.json()) as HubSession) : { authenticated: false };
  } catch {
    return { authenticated: false };
  }
}

export function feishuLoginUrl(returnTo: string): string {
  return `${apiBaseUrl}/api/v1/auth/feishu/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export async function logoutHub(): Promise<void> {
  await fetch(`${apiBaseUrl}/api/v1/auth/logout`, { method: 'POST', credentials: 'include' });
}