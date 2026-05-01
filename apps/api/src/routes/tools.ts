import type { FastifyInstance } from 'fastify';
import type { StaticToolRepository } from '../repositories/staticToolRepository.js';

export function registerToolRoutes(repository: StaticToolRepository) {
  return async function toolRoutes(app: FastifyInstance) {
    app.get('/api/tools', async () => repository.getIndex());
    app.get('/api/tools/index.json', async () => repository.getIndex());

    app.get<{ Params: { slug: string } }>('/api/tools/:slug', async (request, reply) => {
      const slug = request.params.slug.endsWith('.json') ? request.params.slug.slice(0, -5) : request.params.slug;
      const tool = await repository.getTool(slug);
      if (!tool) {
        return reply.code(404).send({ error: 'tool_not_found' });
      }
      return tool;
    });
  };
}