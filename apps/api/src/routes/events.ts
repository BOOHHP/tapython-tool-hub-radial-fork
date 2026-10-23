import type { FastifyInstance } from 'fastify';
import type { HubAuth } from '../identity/hubAuth.js';
import { type EventStore, parseEventBatch } from '../identity/events.js';
import { RateLimiter } from '../identity/rateLimiter.js';

export interface EventRouteDeps {
  store?: EventStore;
  hubAuth?: HubAuth;
}

export function registerEventRoutes(deps: EventRouteDeps) {
  return async function eventRoutes(app: FastifyInstance) {
    app.get('/api/v1/features', async () => ({ auth: Boolean(deps.hubAuth), events: Boolean(deps.store) }));

    const { store, hubAuth } = deps;
    if (!store) {
      return;
    }
    const limiter = new RateLimiter(120, 60_000);

    // Anonymous by design: a valid bearer token only attributes the batch to its user.
    app.post('/api/v1/events', async (request, reply) => {
      if (!limiter.allow(request.ip)) {
        return reply.code(429).send({ error: 'rate_limited' });
      }
      const parsed = parseEventBatch(request.body);
      if (!parsed.ok) {
        return reply.code(400).send({ error: parsed.error });
      }
      const result = store.ingest(parsed.batch, hubAuth?.resolve(request)?.user.openId);
      return reply.code(202).send(result);
    });
  };
}
