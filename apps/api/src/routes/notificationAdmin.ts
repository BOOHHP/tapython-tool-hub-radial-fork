import type { FastifyInstance } from 'fastify';
import { createAdminGuard, type HubAuth } from '../identity/hubAuth.js';
import type { NotificationService } from '../notify/notificationService.js';
import type { AuthService } from '../services/authService.js';
import { sameOrigin } from './identity.js';

export function registerNotificationAdminRoutes(notifications: NotificationService, hubAuth: HubAuth, authService: AuthService) {
  const guard = createAdminGuard(authService, hubAuth);
  return async function notificationAdminRoutes(app: FastifyInstance) {
    app.addHook('preHandler', guard('admin'));

    app.get('/api/v1/admin/notifications', async () => notifications.diagnostics());

    app.post('/api/v1/admin/notifications/test', async (request, reply) => {
      if (!sameOrigin(request)) {
        return reply.code(403).send({ error: 'cross_origin_rejected' });
      }
      const openId = request.actor?.id;
      if (!openId || openId.startsWith('emergency:')) {
        return reply.code(400).send({ error: 'feishu_login_required' });
      }
      const queued = notifications.enqueue('test', openId, `test:${openId}:${Date.now()}`, {
        title: 'Tool Hub 通知测试',
        color: 'green',
        lines: ['**飞书机器人通知已开启**', '收到这张卡片说明通知链路正常。'],
        link: notifications.link('打开 Tool Hub', '')
      });
      if (!queued) {
        return reply.code(400).send({ error: 'recipient_unavailable' });
      }
      return reply.code(202).send(await notifications.flush());
    });
  };
}
