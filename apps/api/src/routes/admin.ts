import type { FastifyInstance } from 'fastify';
import { adminUpdateToolRequestSchema, reviewSubmissionRequestSchema, submissionListResponseSchema } from '@tapython-tool-hub/shared';
import type { SubmissionRepository } from '../repositories/submissionRepository.js';
import type { AuthService } from '../services/authService.js';
import type { AuditLog } from '../identity/auditLog.js';
import { createAdminGuard, type HubAuth } from '../identity/hubAuth.js';
import type { AdminWorkflow } from '../services/adminWorkflow.js';
import type { SubmissionWorkflow } from '../services/submissionWorkflow.js';

export function registerAdminRoutes(
  repository: SubmissionRepository,
  submissionWorkflow: SubmissionWorkflow,
  adminWorkflow: AdminWorkflow,
  authService: AuthService,
  hubAuth?: HubAuth,
  audit?: AuditLog
) {
  const guard = createAdminGuard(authService, hubAuth);
  return async function adminRoutes(app: FastifyInstance) {
    app.addHook('preHandler', guard('reviewer'));

    app.get('/api/admin/submissions', async () => {
      const submissions = await repository.list();
      return submissionListResponseSchema.parse({
        schemaVersion: '1.0.0',
        generatedAt: new Date().toISOString(),
        total: submissions.length,
        submissions
      });
    });

    app.post<{ Params: { id: string } }>('/api/admin/submissions/:id/review', async (request, reply) => {
      const payload = reviewSubmissionRequestSchema.parse(request.body);
      payload.reviewer = request.adminUser?.username ?? payload.reviewer;
      try {
        const submission = await submissionWorkflow.reviewSubmission(request.params.id, payload);
        if (!submission) {
          return reply.code(404).send({ error: 'submission_not_found' });
        }
        audit?.record({ actor: request.actor?.id ?? 'unknown', action: 'submission.review', entityType: 'submission', entityId: request.params.id, after: { decision: payload.decision } });
        return submission;
      } catch (error) {
        return reply.code(409).send({ error: 'review_rejected', message: error instanceof Error ? error.message : String(error) });
      }
    });

    app.delete<{ Params: { id: string } }>('/api/admin/submissions/:id', { preHandler: guard('admin') }, async (request, reply) => {
      const deleted = await repository.delete(request.params.id);
      if (!deleted) {
        return reply.code(404).send({ error: 'submission_not_found' });
      }
      audit?.record({ actor: request.actor?.id ?? 'unknown', action: 'submission.delete', entityType: 'submission', entityId: request.params.id });
      return reply.code(204).send();
    });

    app.patch<{ Params: { slug: string } }>('/api/admin/tools/:slug', { preHandler: guard('admin') }, async (request, reply) => {
      const payload = adminUpdateToolRequestSchema.parse(request.body);
      const tool = await adminWorkflow.updateTool(request.params.slug, payload);
      if (!tool) {
        return reply.code(404).send({ error: 'tool_not_found' });
      }
      audit?.record({ actor: request.actor?.id ?? 'unknown', action: 'tool.update', entityType: 'tool', entityId: request.params.slug, after: payload });
      return tool;
    });

    app.delete<{ Params: { slug: string } }>('/api/admin/tools/:slug', { preHandler: guard('admin') }, async (request, reply) => {
      const deleted = await adminWorkflow.deleteTool(request.params.slug);
      if (!deleted) {
        return reply.code(404).send({ error: 'tool_not_found', message: `未找到可删除工具：${request.params.slug}。请确认后端已重启并且 TOOL_DOCS_ROOT / TOOL_API_ROOT 指向当前工具库。` });
      }
      audit?.record({ actor: request.actor?.id ?? 'unknown', action: 'tool.delete', entityType: 'tool', entityId: request.params.slug });
      return reply.code(204).send();
    });
  };
}
