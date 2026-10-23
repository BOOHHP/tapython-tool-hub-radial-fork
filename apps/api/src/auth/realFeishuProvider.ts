import { FeishuAuthError, type FeishuIdentity, type FeishuProvider } from './feishuProvider.js';

export interface RealFeishuConfig {
  appId: string;
  appSecret: string;
  scope?: string;
  fetchDepartment?: boolean;
  fetch?: typeof fetch;
  authorizeUrl?: string;
  tokenUrl?: string;
  apiBase?: string;
}

const defaultAuthorizeUrl = 'https://accounts.feishu.cn/open-apis/authen/v1/authorize';
const defaultTokenUrl = 'https://open.feishu.cn/open-apis/authen/v2/oauth/token';
const defaultApiBase = 'https://open.feishu.cn/open-apis';
const invalidCodeErrors = new Set([20003, 20004, 20065]);
const requestTimeoutMs = 10_000;

interface FeishuEnvelope {
  code?: number;
  msg?: string;
  error?: string;
  error_description?: string;
  access_token?: string;
  tenant_access_token?: string;
  expire?: number;
  data?: Record<string, any>;
}

export class RealFeishuProvider implements FeishuProvider {
  private readonly http: typeof fetch;
  private readonly authorizeUrl: string;
  private readonly tokenUrl: string;
  private readonly apiBase: string;
  private tenantToken?: { value: string; expiresAt: number };

  constructor(private readonly config: RealFeishuConfig) {
    this.http = config.fetch ?? fetch;
    this.authorizeUrl = config.authorizeUrl ?? defaultAuthorizeUrl;
    this.tokenUrl = config.tokenUrl ?? defaultTokenUrl;
    this.apiBase = config.apiBase ?? defaultApiBase;
  }

  buildAuthorizeUrl(state: string, redirectUri: string, options: { codeChallenge?: string } = {}): string {
    const url = new URL(this.authorizeUrl);
    url.searchParams.set('client_id', this.config.appId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    if (this.config.scope) {
      url.searchParams.set('scope', this.config.scope);
    }
    if (options.codeChallenge) {
      url.searchParams.set('code_challenge', options.codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');
    }
    return url.toString();
  }

  async exchangeCode(code: string, redirectUri: string, options: { codeVerifier?: string } = {}): Promise<FeishuIdentity> {
    const token = await this.call(this.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: this.config.appId,
        client_secret: this.config.appSecret,
        code,
        redirect_uri: redirectUri,
        ...(options.codeVerifier ? { code_verifier: options.codeVerifier } : {})
      })
    });
    if (token.code !== 0 || !token.access_token) {
      const invalid = invalidCodeErrors.has(Number(token.code));
      throw new FeishuAuthError(invalid ? 'invalid_code' : 'exchange_failed', `Feishu token exchange failed (code ${token.code ?? 'unknown'})`);
    }

    const info = await this.call(`${this.apiBase}/authen/v1/user_info`, { method: 'GET', headers: { Authorization: `Bearer ${token.access_token}` } });
    const data = info.data;
    if (info.code !== 0 || !data?.open_id) {
      throw new FeishuAuthError('exchange_failed', `Feishu user info failed (code ${info.code ?? 'unknown'})`);
    }

    return {
      openId: String(data.open_id),
      unionId: data.union_id ? String(data.union_id) : undefined,
      name: String(data.name ?? data.en_name ?? data.open_id),
      email: stringOrUndefined(data.email) ?? stringOrUndefined(data.enterprise_email),
      department: this.config.fetchDepartment ? await this.lookupDepartment(String(data.open_id)) : undefined
    };
  }

  // Department is a convenience; any failure here must not block sign-in.
  private async lookupDepartment(openId: string): Promise<string | undefined> {
    try {
      const token = await this.tenantAccessToken();
      const headers = { Authorization: `Bearer ${token}` };
      const user = await this.call(`${this.apiBase}/contact/v3/users/${encodeURIComponent(openId)}?user_id_type=open_id&department_id_type=open_department_id`, { method: 'GET', headers });
      const record = user.data?.user;
      if (user.code !== 0 || !record) {
        return undefined;
      }
      const primary = (record.orders as Array<{ department_id?: string; is_primary_dept?: boolean }> | undefined)?.find((o) => o.is_primary_dept)?.department_id;
      const departmentId = primary ?? (record.department_ids as string[] | undefined)?.[0];
      if (!departmentId) {
        return undefined;
      }
      const department = await this.call(`${this.apiBase}/contact/v3/departments/${encodeURIComponent(departmentId)}?department_id_type=open_department_id`, { method: 'GET', headers });
      return department.code === 0 ? stringOrUndefined(department.data?.department?.name) : undefined;
    } catch {
      return undefined;
    }
  }

  private async tenantAccessToken(): Promise<string> {
    if (this.tenantToken && this.tenantToken.expiresAt > Date.now() + 60_000) {
      return this.tenantToken.value;
    }
    const response = await this.call(`${this.apiBase}/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ app_id: this.config.appId, app_secret: this.config.appSecret })
    });
    if (response.code !== 0 || !response.tenant_access_token) {
      throw new Error('tenant token unavailable');
    }
    this.tenantToken = { value: response.tenant_access_token, expiresAt: Date.now() + Number(response.expire ?? 7200) * 1000 };
    return response.tenant_access_token;
  }

  private async call(url: string, init: RequestInit): Promise<FeishuEnvelope> {
    let response: Response;
    try {
      response = await this.http(url, { ...init, signal: AbortSignal.timeout(requestTimeoutMs) });
    } catch {
      throw new FeishuAuthError('exchange_failed', 'Feishu is unreachable');
    }
    try {
      return (await response.json()) as FeishuEnvelope;
    } catch {
      throw new FeishuAuthError('exchange_failed', `Feishu returned an unreadable response (HTTP ${response.status})`);
    }
  }
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}
