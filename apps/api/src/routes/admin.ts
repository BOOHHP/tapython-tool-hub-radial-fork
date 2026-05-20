import type { FastifyInstance } from 'fastify';
import { adminUpdateToolRequestSchema, reviewSubmissionRequestSchema, submissionListResponseSchema } from '@tapython-tool-hub/shared';
import type { SubmissionRepository } from '../repositories/submissionRepository.js';
import type { AuthService } from '../services/authService.js';
import type { AdminWorkflow } from '../services/adminWorkflow.js';
import type { SubmissionWorkflow } from '../services/submissionWorkflow.js';

export function registerAdminRoutes(
  repository: SubmissionRepository,
  submissionWorkflow: SubmissionWorkflow,
  adminWorkflow: AdminWorkflow,
  authService: AuthService
) {
  return async function adminRoutes(app: FastifyInstance) {
    app.addHook('preHandler', authService.requireAdmin);

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
        return submission;
      } catch (error) {
        return reply.code(409).send({ error: 'review_rejected', message: error instanceof Error ? error.message : String(error) });
      }
    });

    app.delete<{ Params: { id: string } }>('/api/admin/submissions/:id', async (request, reply) => {
      const deleted = await repository.delete(request.params.id);
      if (!deleted) {
        return reply.code(404).send({ error: 'submission_not_found' });
      }
      return reply.code(204).send();
    });

    app.patch<{ Params: { slug: string } }>('/api/admin/tools/:slug', async (request, reply) => {
      const payload = adminUpdateToolRequestSchema.parse(request.body);
      const tool = await adminWorkflow.updateTool(request.params.slug, payload);
      if (!tool) {
        return reply.code(404).send({ error: 'tool_not_found' });
      }
      return tool;
    });
  };
}
