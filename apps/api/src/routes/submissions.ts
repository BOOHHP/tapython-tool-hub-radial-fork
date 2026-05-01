import type { FastifyInstance } from 'fastify';
import { reviewSubmissionRequestSchema, submissionListResponseSchema, toolSubmissionRequestSchema } from '@tapython-tool-hub/shared';
import type { SubmissionRepository } from '../repositories/submissionRepository.js';
import type { SubmissionWorkflow } from '../services/submissionWorkflow.js';

export function registerSubmissionRoutes(repository: SubmissionRepository, workflow: SubmissionWorkflow) {
  return async function submissionRoutes(app: FastifyInstance) {
    app.get('/api/submissions', async () => {
      const submissions = await repository.list();
      return submissionListResponseSchema.parse({
        schemaVersion: '1.0.0',
        generatedAt: new Date().toISOString(),
        total: submissions.length,
        submissions
      });
    });

    app.post('/api/submissions', async (request, reply) => {
      const payload = toolSubmissionRequestSchema.parse(request.body);
      const submission = await workflow.createSubmission(payload);
      return reply.code(201).send(submission);
    });

    app.get<{ Params: { id: string } }>('/api/submissions/:id', async (request, reply) => {
      const submission = await repository.get(request.params.id);
      if (!submission) {
        return reply.code(404).send({ error: 'submission_not_found' });
      }
      return submission;
    });

    app.post<{ Params: { id: string } }>('/api/submissions/:id/review', async (request, reply) => {
      const payload = reviewSubmissionRequestSchema.parse(request.body);
      try {
        const submission = await workflow.reviewSubmission(request.params.id, payload);
        if (!submission) {
          return reply.code(404).send({ error: 'submission_not_found' });
        }
        return submission;
      } catch (error) {
        return reply.code(409).send({ error: 'review_rejected', message: error instanceof Error ? error.message : String(error) });
      }
    });
  };
}