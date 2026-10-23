import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AliasError, type AliasKind, type AuthorAliases } from '../identity/authorAliases.js';
import { LastAdminError, type Role, type UserRecord, type UserRepository } from '../identity/userRepository.js';

const assignableRoles: Role[] = ['reviewer', 'admin'];

function adminUserView(user: UserRecord) {
  return {
    openId: user.openId,
    name: user.name,
    email: user.email,
    department: user.department,
    team: user.team,
    status: user.status,
    roles: user.roles,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt
  };
}

export function registerAdminUserRoutes(users: UserRepository, guard: (role: Role) => (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>, aliases: AuthorAliases) {
  return async function adminUserRoutes(app: FastifyInstance) {
    app.addHook('preHandler', guard('admin'));

    app.put<{ Params: { openId: string }; Body: { team?: unknown } }>('/api/admin/users/:openId/team', async (request, reply) => {
      const team = request.body?.team;
      if (team !== null && (typeof team !== 'string' || team.length > 100)) {
        return reply.code(400).send({ error: 'invalid_team' });
      }
      if (!users.get(request.params.openId)) {
        return reply.code(404).send({ error: 'user_not_found' });
      }
      return adminUserView(users.setTeam(request.actor!.id, request.params.openId, team));
    });

    app.get('/api/admin/author-aliases', async () => ({ aliases: aliases.list(), candidates: aliases.candidates() }));

    app.put<{ Body: { alias?: unknown; kind?: unknown; openId?: unknown } }>('/api/admin/author-aliases', async (request, reply) => {
      const { alias, kind, openId } = request.body ?? {};
      if (typeof alias !== 'string' || (kind !== 'person' && kind !== 'team') || (openId !== undefined && typeof openId !== 'string')) {
        return reply.code(400).send({ error: 'invalid_alias' });
      }
      try {
        return aliases.bind(request.actor!.id, alias, kind as AliasKind, openId as string | undefined);
      } catch (error) {
        if (error instanceof AliasError) {
          return reply.code(400).send({ error: 'invalid_alias', message: error.message });
        }
        throw error;
      }
    });

    app.delete<{ Querystring: { alias?: string } }>('/api/admin/author-aliases', async (request, reply) => {
      if (!request.query.alias) {
        return reply.code(400).send({ error: 'invalid_alias' });
      }
      return aliases.unbind(request.actor!.id, request.query.alias) ? reply.code(204).send() : reply.code(404).send({ error: 'alias_not_found' });
    });

    app.get('/api/admin/users', async () => {
      const list = users.list();
      return { total: list.length, users: list.map(adminUserView) };
    });

    app.put<{ Params: { openId: string }; Body: { roles?: unknown } }>('/api/admin/users/:openId/roles', async (request, reply) => {
      const roles = request.body?.roles;
      if (!Array.isArray(roles) || !roles.every((role): role is Role => assignableRoles.includes(role as Role))) {
        return reply.code(400).send({ error: 'invalid_roles', allowed: assignableRoles });
      }
      if (!users.get(request.params.openId)) {
        return reply.code(404).send({ error: 'user_not_found' });
      }
      try {
        return adminUserView(users.setRoles(request.actor!.id, request.params.openId, roles));
      } catch (error) {
        if (error instanceof LastAdminError) {
          return reply.code(409).send({ error: 'last_admin' });
        }
        throw error;
      }
    });

    app.post<{ Params: { openId: string } }>('/api/admin/users/:openId/left', async (request, reply) => {
      if (!users.get(request.params.openId)) {
        return reply.code(404).send({ error: 'user_not_found' });
      }
      try {
        return adminUserView(users.markLeft(request.actor!.id, request.params.openId));
      } catch (error) {
        if (error instanceof LastAdminError) {
          return reply.code(409).send({ error: 'last_admin' });
        }
        throw error;
      }
    });
  };
}
