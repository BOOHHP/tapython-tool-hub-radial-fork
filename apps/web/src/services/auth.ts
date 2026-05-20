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