export type CardColor = 'blue' | 'green' | 'red' | 'orange' | 'grey';

export interface NotificationMessage {
  title: string;
  color: CardColor;
  // lark_md lines; already truncated by the caller.
  lines: string[];
  link?: { text: string; url: string };
}

export interface FeishuBot {
  send(openId: string, message: NotificationMessage, uuid: string): Promise<void>;
}

export class BotSendError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = 'BotSendError';
  }
}

export interface RealFeishuBotConfig {
  appId: string;
  appSecret: string;
  fetch?: typeof fetch;
  apiBase?: string;
}

const defaultApiBase = 'https://open.feishu.cn/open-apis';
const requestTimeoutMs = 10_000;
// 99991400 = request frequency limit; everything else from Feishu (no permission, user out of app scope) will not heal by retrying.
const retryableCodes = new Set([99991400]);

export class RealFeishuBot implements FeishuBot {
  private readonly http: typeof fetch;
  private readonly apiBase: string;
  private tenantToken?: { value: string; expiresAt: number };

  constructor(private readonly config: RealFeishuBotConfig) {
    this.http = config.fetch ?? fetch;
    this.apiBase = config.apiBase ?? defaultApiBase;
  }

  async send(openId: string, message: NotificationMessage, uuid: string): Promise<void> {
    const token = await this.tenantAccessToken();
    const response = await this.request(`${this.apiBase}/im/v1/messages?receive_id_type=open_id`, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ receive_id: openId, msg_type: 'interactive', content: JSON.stringify(buildCard(message)), uuid })
    });
    if (response.body.code !== 0) {
      if (response.body.code === 99991663 || response.body.code === 99991661) {
        this.tenantToken = undefined;
        throw new BotSendError(`Feishu token rejected (code ${response.body.code})`, true);
      }
      throw new BotSendError(`Feishu send failed (code ${response.body.code ?? 'unknown'}: ${response.body.msg ?? ''})`, retryableCodes.has(Number(response.body.code)) || response.status >= 500);
    }
  }

  private async tenantAccessToken(): Promise<string> {
    if (this.tenantToken && this.tenantToken.expiresAt > Date.now() + 60_000) {
      return this.tenantToken.value;
    }
    const response = await this.request(`${this.apiBase}/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ app_id: this.config.appId, app_secret: this.config.appSecret })
    });
    const body = response.body;
    if (body.code !== 0 || typeof body.tenant_access_token !== 'string') {
      throw new BotSendError(`Feishu tenant token unavailable (code ${body.code ?? 'unknown'}: ${body.msg ?? ''})`, response.status >= 500);
    }
    this.tenantToken = { value: body.tenant_access_token, expiresAt: Date.now() + Number(body.expire ?? 7200) * 1000 };
    return body.tenant_access_token;
  }

  private async request(url: string, init: RequestInit): Promise<{ status: number; body: { code?: number; msg?: string; tenant_access_token?: string; expire?: number } }> {
    let response: Response;
    try {
      response = await this.http(url, { ...init, signal: AbortSignal.timeout(requestTimeoutMs) });
    } catch {
      throw new BotSendError('Feishu is unreachable', true);
    }
    try {
      return { status: response.status, body: (await response.json()) as never };
    } catch {
      throw new BotSendError(`Feishu returned an unreadable response (HTTP ${response.status})`, response.status >= 500);
    }
  }
}

// Development and tests: records cards instead of calling Feishu.
export class MockFeishuBot implements FeishuBot {
  readonly sent: Array<{ openId: string; message: NotificationMessage; uuid: string }> = [];
  failWith?: BotSendError;

  async send(openId: string, message: NotificationMessage, uuid: string): Promise<void> {
    if (this.failWith) {
      throw this.failWith;
    }
    this.sent.push({ openId, message, uuid });
  }
}

export function buildCard(message: NotificationMessage) {
  const elements: unknown[] = [{ tag: 'div', text: { tag: 'lark_md', content: message.lines.join('\n') } }];
  if (message.link) {
    elements.push({ tag: 'action', actions: [{ tag: 'button', type: 'primary', text: { tag: 'plain_text', content: message.link.text }, url: message.link.url }] });
  }
  return {
    config: { wide_screen_mode: true },
    header: { title: { tag: 'plain_text', content: message.title }, template: message.color },
    elements
  };
}
