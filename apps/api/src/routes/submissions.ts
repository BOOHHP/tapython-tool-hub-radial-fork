import type { FastifyInstance } from 'fastify';
import { submissionListResponseSchema, toolSubmissionRequestSchema } from '@tapython-tool-hub/shared';
import type { SubmissionRepository } from '../repositories/submissionRepository.js';
import type { PackageSubmissionMetadata } from '../services/submissionWorkflow.js';
import type { SubmissionWorkflow } from '../services/submissionWorkflow.js';

interface PackageSubmissionQuery {
  submitter?: string;
  notes?: string;
  displayName?: string;
  description?: string;
  author?: string;
  ownerTeam?: string;
  category?: string;
  riskLevel?: string;
  unrealEngine?: string;
  tapython?: string;
  plugins?: string;
  tags?: string;
  features?: string;
  unrealApis?: string;
  widgetAkas?: string;
  riskNotes?: string;
}

export function registerSubmissionRoutes(repository: SubmissionRepository, workflow: SubmissionWorkflow) {
  return async function submissionRoutes(app: FastifyInstance) {
    app.addContentTypeParser(['application/zip', 'application/octet-stream'], { parseAs: 'buffer' }, (_request, body, done) => {
      done(null, body);
    });

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

    app.post<{ Querystring: PackageSubmissionQuery; Headers: { 'x-submitter'?: string } }>('/api/submissions/package', async (request, reply) => {
      const submitter = request.query.submitter ?? request.headers['x-submitter'];
      if (!submitter) {
        return reply.code(400).send({ error: 'submitter_required' });
      }

      if (!Buffer.isBuffer(request.body)) {
        return reply.code(415).send({ error: 'package_body_required' });
      }

      const submission = await workflow.createPackageSubmission({
        packageBuffer: request.body,
        submitter,
        notes: request.query.notes,
        metadata: readPackageSubmissionMetadata(request.query)
      });
      return reply.code(201).send(submission);
    });

    app.get<{ Params: { id: string } }>('/api/submissions/:id', async (request, reply) => {
      const submission = await repository.get(request.params.id);
      if (!submission) {
        return reply.code(404).send({ error: 'submission_not_found' });
      }
      return submission;
    });

  };
}

function readPackageSubmissionMetadata(query: PackageSubmissionQuery): PackageSubmissionMetadata {
  return removeUndefined({
    displayName: cleanScalar(query.displayName),
    description: cleanScalar(query.description),
    author: cleanScalar(query.author),
    ownerTeam: cleanScalar(query.ownerTeam),
    category: cleanScalar(query.category),
    riskLevel: readRiskLevel(query.riskLevel),
    unrealEngine: cleanList(query.unrealEngine),
    tapython: cleanList(query.tapython),
    plugins: cleanList(query.plugins),
    tags: cleanList(query.tags),
    features: cleanList(query.features),
    unrealApis: cleanList(query.unrealApis),
    widgetAkas: cleanList(query.widgetAkas),
    riskNotes: cleanList(query.riskNotes)
  });
}

function cleanScalar(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function cleanList(value: string | undefined): string[] | undefined {
  const items = value
    ?.split(/[\r\n,，]+/)
    .map((item) => item.replace(/^[-*]\s+/, '').trim())
    .filter(Boolean);
  return items && items.length > 0 ? Array.from(new Set(items)) : undefined;
}

function readRiskLevel(value: string | undefined): PackageSubmissionMetadata['riskLevel'] | undefined {
  return value === 'low' || value === 'medium' || value === 'high' ? value : undefined;
}

function removeUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}