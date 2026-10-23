import { createHash } from 'node:crypto';
import { RealFeishuProvider } from './realFeishuProvider.js';

export interface FeishuIdentity {
  openId: string;
  unionId?: string;
  name: string;
  email?: string;
  department?: string;
}

export interface FeishuProvider {
  buildAuthorizeUrl(state: string, redirectUri: string, options?: { codeChallenge?: string }): string;
  exchangeCode(code: string, redirectUri: string, options?: { codeVerifier?: string }): Promise<FeishuIdentity>;
}

export class FeishuAuthError extends Error {
  constructor(readonly code: 'invalid_code' | 'exchange_failed', message: string) {
    super(message);
    this.name = 'FeishuAuthError';
  }
}

const mockPrefix = 'mock:';

// Dev/test stand-in for Feishu OAuth; the code is "mock:<email>" and maps to a stable fake identity.
export class MockFeishuProvider implements FeishuProvider {
  constructor(private readonly defaultUser = 'dev@example.com') {}

  buildAuthorizeUrl(state: string, redirectUri: string): string {
    const url = new URL(redirectUri);
    url.searchParams.set('code', `${mockPrefix}${this.defaultUser}`);
    url.searchParams.set('state', state);
    return url.toString();
  }

  async exchangeCode(code: string, _redirectUri?: string, _options?: { codeVerifier?: string }): Promise<FeishuIdentity> {
    const email = code.startsWith(mockPrefix) ? code.slice(mockPrefix.length).trim() : '';
    if (!email) {
      throw new FeishuAuthError('invalid_code', 'Mock provider only accepts codes of the form mock:<email>');
    }
    const digest = createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 16);
    return { openId: `ou_mock_${digest}`, unionId: `on_mock_${digest}`, name: email.split('@')[0], email };
  }
}

export interface FeishuProviderOptions {
  provider?: string;
  host?: string;
  appId?: string;
  appSecret?: string;
  scope?: string;
  fetchDepartment?: boolean;
  warn?: (message: string, detail: Record<string, unknown>) => void;
}

const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1']);

export function createFeishuProvider(options: FeishuProviderOptions): FeishuProvider | undefined {
  if (!options.provider) {
    return undefined;
  }
  if (options.provider === 'mock') {
    // The mock accepts any identity, so it must never listen on a reachable interface.
    if (!loopbackHosts.has(options.host ?? '')) {
      throw new Error('FEISHU_PROVIDER=mock is only allowed when API_HOST is a loopback address');
    }
    return new MockFeishuProvider();
  }
  if (options.provider === 'real') {
    if (!options.appId || !options.appSecret) {
      throw new Error('FEISHU_PROVIDER=real requires FEISHU_APP_ID and FEISHU_APP_SECRET');
    }
    return new RealFeishuProvider({ appId: options.appId, appSecret: options.appSecret, scope: options.scope, fetchDepartment: options.fetchDepartment, warn: options.warn });
  }
  throw new Error(`Unknown FEISHU_PROVIDER: ${options.provider}`);
}
