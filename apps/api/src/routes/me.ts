import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AliasError } from '../identity/authorAliases.js';
import { FavoriteLimitError, isValidSlug, type FavoriteStore } from '../identity/favorites.js';
import type { HubAuth } from '../identity/hubAuth.js';
import type { ProfileService } from '../identity/profile.js';
import { publicUser, sameOrigin } from './identity.js';

// Everything here belongs to the signed-in Feishu user; the emergency admin has no personal data.
export function registerMeRoutes(hubAuth: HubAuth, favorites: FavoriteStore, profile: ProfileService) {
  const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
    const session = hubAuth.resolveWithRefresh(request, reply);
    if (!session) {
      return reply.code(401).send({ error: 'login_required' });
    }
    if (request.method !== 'GET' && !sameOrigin(request)) {
      return reply.code(403).send({ error: 'cross_origin_rejected' });
    }
  };
  const openIdOf = (request: FastifyRequest) => request.hubSession!.user.openId;

  return async function meRoutes(app: FastifyInstance) {
    app.addHook('preHandler', authenticate);
    app.addHook('onSend', async (_request, reply) => {
      reply.header('Cache-Control', 'no-store');
    });

    app.get('/api/v1/me/favorites', async (request) => ({ slugs: favorites.list(openIdOf(request)) }));

    app.post<{ Body: { slugs?: unknown } }>('/api/v1/me/favorites/merge', async (request, reply) => {
      const slugs = request.body?.slugs;
      if (!Array.isArray(slugs) || slugs.length > 1000 || !slugs.every(isValidSlug)) {
        return reply.code(400).send({ error: 'invalid_slugs' });
      }
      try {
        return { slugs: favorites.merge(openIdOf(request), slugs) };
      } catch (error) {
        if (error instanceof FavoriteLimitError) {
          return reply.code(409).send({ error: 'too_many_favorites' });
        }
        throw error;
      }
    });

    app.put<{ Params: { slug: string } }>('/api/v1/me/favorites/:slug', async (request, reply) => {
      if (!isValidSlug(request.params.slug)) {
        return reply.code(400).send({ error: 'invalid_slug' });
      }
      try {
        favorites.add(openIdOf(request), request.params.slug);
        return reply.code(204).send();
      } catch (error) {
        if (error instanceof FavoriteLimitError) {
          return reply.code(409).send({ error: 'too_many_favorites' });
        }
        throw error;
      }
    });

    app.delete<{ Params: { slug: string } }>('/api/v1/me/favorites/:slug', async (request, reply) => {
      favorites.remove(openIdOf(request), request.params.slug);
      return reply.code(204).send();
    });

    app.get('/api/v1/me/profile', async (request) => ({ user: publicUser(request.hubSession!.user), ...profile.get(openIdOf(request)) }));

    app.post<{ Body: { alias?: unknown } }>('/api/v1/me/aliases', async (request, reply) => {
      const alias = request.body?.alias;
      if (typeof alias !== 'string') {
        return reply.code(400).send({ error: 'invalid_alias' });
      }
      try {
        profile.claim(openIdOf(request), alias);
        return reply.code(204).send();
      } catch (error) {
        if (error instanceof AliasError) {
          return reply.code(409).send({ error: 'alias_unavailable', message: error.message });
        }
        throw error;
      }
    });

    app.delete<{ Querystring: { alias?: string } }>('/api/v1/me/aliases', async (request, reply) => {
      const released = request.query.alias ? profile.release(openIdOf(request), request.query.alias) : false;
      return released ? reply.code(204).send() : reply.code(404).send({ error: 'alias_not_found' });
    });
  };
}
