import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { LastAdminError, type Role, type UserRecord, type UserRepository } from '../identity/userRepository.js';

const assignableRoles: Role[] = ['reviewer', 'admin'];

function adminUserView(user: UserRecord) {
  return {
    openId: user.openId,
    name: user.name,
    email: user.email,
    department: user.department,
    status: user.status,
    roles: user.roles,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt
  };
}

export function registerAdminUserRoutes(users: UserRepository, guard: (role: Role) => (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>) {
  return async function adminUserRoutes(app: FastifyInstance) {
    app.addHook('preHandler', guard('admin'));

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
