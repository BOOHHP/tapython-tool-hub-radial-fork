import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AuditLog } from '../identity/auditLog.js';
import { createAdminGuard, hasRole, type HubAuth } from '../identity/hubAuth.js';
import type { NotificationService } from '../notify/notificationService.js';
import type { AuthService } from '../services/authService.js';
import { isValidSlug } from '../identity/favorites.js';
import { sameOrigin } from './identity.js';
import {
  FeedbackLimitError,
  FeedbackValidationError,
  feedbackClients,
  feedbackKinds,
  feedbackStatuses,
  type FeedbackInput,
  type FeedbackKind,
  type FeedbackRecord,
  type FeedbackStatus,
  type FeedbackStore
} from '../feedback/feedbackStore.js';

export interface FeedbackRouteDeps {
  store: FeedbackStore;
  hubAuth: HubAuth;
  authService: AuthService;
  audit?: AuditLog;
  notifications?: NotificationService | null;
}

export function registerFeedbackRoutes(deps: FeedbackRouteDeps) {
  const { store, hubAuth, authService, audit } = deps;
  const guard = createAdminGuard(authService, hubAuth);

  const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!hubAuth.resolveWithRefresh(request, reply)) {
      return reply.code(401).send({ error: 'login_required' });
    }
    if (request.method !== 'GET' && !sameOrigin(request)) {
      return reply.code(403).send({ error: 'cross_origin_rejected' });
    }
  };
  const ref = (feedback: FeedbackRecord) => ({
    id: feedback.id,
    kind: feedback.kind,
    title: feedback.title,
    body: feedback.body,
    authorOpenId: feedback.author.openId,
    authorName: feedback.author.name,
    assigneeOpenId: feedback.assignee?.openId,
    updatedAt: feedback.updatedAt
  });
  const notify = (action: (service: NotificationService) => void) => {
    try {
      if (deps.notifications) action(deps.notifications);
    } catch {
      // Notifications never fail the request.
    }
  };

  return async function feedbackRoutes(app: FastifyInstance) {
    app.addHook('onSend', async (_request, reply) => {
      reply.header('Cache-Control', 'no-store');
    });

    app.register(async (member) => {
      member.addHook('preHandler', authenticate);
      const session = (request: FastifyRequest) => request.hubSession!;

      member.post<{ Body: unknown }>('/api/v1/feedback', async (request, reply) => {
        const input = parseFeedbackInput(request.body);
        if ('error' in input) {
          return reply.code(400).send(input);
        }
        try {
          const created = store.create(session(request).user.openId, input);
          notify((service) => service.feedbackCreated(ref(created)));
          return reply.code(201).send(created);
        } catch (error) {
          if (error instanceof FeedbackLimitError) {
            return reply.code(429).send({ error: 'too_many_feedback' });
          }
          throw error;
        }
      });

      member.get('/api/v1/me/feedback', async (request) => ({ feedback: store.listForUser(session(request).user.openId) }));

      member.get<{ Params: { id: string } }>('/api/v1/feedback/:id', async (request, reply) => {
        const detail = store.get(request.params.id);
        if (!detail || !canAccess(session(request).user, detail.author.openId)) {
          return reply.code(404).send({ error: 'feedback_not_found' });
        }
        return detail;
      });

      member.post<{ Params: { id: string }; Body: { body?: unknown } }>('/api/v1/feedback/:id/replies', async (request, reply) => {
        const user = session(request).user;
        const detail = store.get(request.params.id);
        if (!detail || !canAccess(user, detail.author.openId)) {
          return reply.code(404).send({ error: 'feedback_not_found' });
        }
        const body = cleanText(request.body?.body, 2000);
        if (!body) {
          return reply.code(400).send({ error: 'invalid_body' });
        }
        const created = store.addReply(detail.id, user.openId, body);
        const staff = hasRole(user.roles, 'reviewer');
        notify((service) => service.feedbackReplied(ref(detail), { id: created.id, authorOpenId: user.openId, authorName: user.name, body, staff }));
        return reply.code(201).send(created);
      });
    });

    app.register(async (admin) => {
      admin.addHook('preHandler', guard('reviewer'));

      admin.get<{ Querystring: { status?: string; kind?: string } }>('/api/v1/admin/feedback', async (request, reply) => {
        const { status, kind } = request.query;
        if ((status && !isOneOf(feedbackStatuses, status)) || (kind && !isOneOf(feedbackKinds, kind))) {
          return reply.code(400).send({ error: 'invalid_filter' });
        }
        return { feedback: store.list({ status: status as FeedbackStatus | undefined, kind: kind as FeedbackKind | undefined }) };
      });

      admin.get<{ Params: { id: string } }>('/api/v1/admin/feedback/:id', async (request, reply) => {
        const detail = store.get(request.params.id);
        return detail ?? reply.code(404).send({ error: 'feedback_not_found' });
      });

      admin.patch<{ Params: { id: string }; Body: { status?: unknown; assignee?: unknown } }>('/api/v1/admin/feedback/:id', async (request, reply) => {
        if (!sameOrigin(request)) {
          return reply.code(403).send({ error: 'cross_origin_rejected' });
        }
        const { status, assignee } = request.body ?? {};
        if (status !== undefined && !isOneOf(feedbackStatuses, status)) {
          return reply.code(400).send({ error: 'invalid_status' });
        }
        if (assignee !== undefined && assignee !== null && typeof assignee !== 'string') {
          return reply.code(400).send({ error: 'invalid_assignee' });
        }
        if (typeof assignee === 'string' && assignee.startsWith('emergency:')) {
          return reply.code(400).send({ error: 'invalid_assignee' });
        }
        let result: ReturnType<FeedbackStore['update']>;
        try {
          result = store.update(request.params.id, { status: status as FeedbackStatus | undefined, assigneeOpenId: assignee as string | null | undefined });
        } catch (error) {
          if (error instanceof FeedbackValidationError) {
            return reply.code(400).send({ error: error.code, message: error.message });
          }
          throw error;
        }
        if (!result) {
          return reply.code(404).send({ error: 'feedback_not_found' });
        }
        const actorName = request.actor?.name ?? 'admin';
        audit?.record({ actor: request.actor?.id ?? 'unknown', action: 'feedback.update', entityType: 'feedback', entityId: request.params.id, before: { status: result.before.status, assignee: result.before.assignee?.openId ?? null }, after: { status: result.after.status, assignee: result.after.assignee?.openId ?? null } });
        notify((service) => {
          if (result!.after.status !== result!.before.status) service.feedbackStatusChanged(ref(result!.after), result!.after.status, actorName);
          const next = result!.after.assignee?.openId;
          if (next && next !== result!.before.assignee?.openId && next !== request.actor?.id) service.feedbackAssigned(ref(result!.after), next);
        });
        return result.after;
      });
    });
  };
}

function canAccess(user: { openId: string; roles: Parameters<typeof hasRole>[0] }, authorOpenId: string): boolean {
  return user.openId === authorOpenId || hasRole(user.roles, 'reviewer');
}

function isOneOf<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : undefined;
}

function parseFeedbackInput(body: unknown): FeedbackInput | { error: string } {
  const raw = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (!isOneOf(feedbackKinds, raw.kind)) return { error: 'invalid_kind' };
  const title = cleanText(raw.title, 100);
  if (!title) return { error: 'invalid_title' };
  const text = cleanText(raw.body, 4000);
  if (!text) return { error: 'invalid_body' };
  const input: FeedbackInput = { kind: raw.kind, title, body: text };
  if (raw.slug !== undefined && raw.slug !== '') {
    if (typeof raw.slug !== 'string' || !isValidSlug(raw.slug)) return { error: 'invalid_slug' };
    input.slug = raw.slug;
  }
  if (raw.client !== undefined) {
    if (!isOneOf(feedbackClients, raw.client)) return { error: 'invalid_client' };
    input.client = raw.client;
  }
  for (const [key, field] of [['clientVersion', 'clientVersion'], ['ueVersion', 'ueVersion']] as const) {
    const value = raw[key];
    if (value === undefined || value === '') continue;
    const clean = cleanText(value, 40);
    if (!clean) return { error: `invalid_${field}` };
    input[field] = clean;
  }
  return input;
}
