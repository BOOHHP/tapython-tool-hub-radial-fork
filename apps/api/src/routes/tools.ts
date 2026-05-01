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

    app.get<{ Params: { slug: string } }>('/api/tools/:slug/install-prompt', async (request, reply) => {
      const result = await repository.getTool(request.params.slug);
      if (!result) {
        return reply.code(404).send({ error: 'tool_not_found' });
      }

      const t = result.tool;
      const hubBase = `${request.protocol}://${request.hostname}`;
      const prompt = [
        `请帮我从 TAPython Tool Hub 安装工具：${t.slug}。`,
        '',
        `1. 先检查本机是否可用 tapython-tool-hub CLI：执行 tapython-tool-hub --version。`,
        `2. 如果未安装 CLI，请根据当前操作系统安装 Tool Hub CLI；只安装 CLI，不修改 UE 项目。`,
        `3. 安装或确认 CLI 后，读取工具 API：${hubBase}/api/tools/${t.slug}.json。`,
        `4. 下载 manifest 和 ZIP 包，校验 hash。`,
        `5. 先执行 dry-run，展示目标项目路径、将写入的文件、已有文件冲突、MenuConfig.json 合并 diff 和回滚方案。`,
        `6. 等我确认后再执行实际安装。`,
        '',
        '推荐命令：',
        `tapython-tool-hub install ${t.slug} --hub ${hubBase} --project "<Project>" --dry-run`,
      ].join('\n');

      return reply.type('text/plain; charset=utf-8').send(prompt);
    });

    app.get<{ Params: { slug: string; version: string } }>(
      '/api/tools/:slug/versions/:version/install-plan-template',
      async (request, reply) => {
        const result = await repository.getTool(request.params.slug);
        if (!result) {
          return reply.code(404).send({ error: 'tool_not_found' });
        }

        const t = result.tool;
        const ver = t.versions.find((v: { version: string }) => v.version === request.params.version);
        if (!ver) {
          return reply.code(404).send({ error: 'version_not_found' });
        }

        const hubBase = `${request.protocol}://${request.hostname}`;
        return {
          slug: t.slug,
          version: ver.version,
          displayName: t.displayName,
          riskLevel: t.riskLevel,
          installPath: t.installPath,
          mountPoint: t.mountPoint,
          downloads: {
            manifest: `${hubBase}${ver.downloads.manifest}`,
            package: `${hubBase}${ver.downloads.package}`,
            packageSha256: ver.downloads.packageSha256 || null,
            packageSize: ver.downloads.packageSize || null,
          },
          manifest: ver.manifest,
          riskNotes: t.summary.riskNotes,
          preInstallChecks: ver.manifest.preInstallChecks,
          postInstallSteps: ver.manifest.postInstallSteps,
          cliCommand: `tapython-tool-hub install ${t.slug} --hub ${hubBase} --project "<Project>"`,
        };
      }
    );

    app.get<{ Params: { slug: string; version: string } }>(
      '/api/tools/:slug/versions/:version/package.sha256',
      async (request, reply) => {
        const result = await repository.getTool(request.params.slug);
        if (!result) {
          return reply.code(404).send({ error: 'tool_not_found' });
        }

        const t = result.tool;
        const ver = t.versions.find((v: { version: string }) => v.version === request.params.version);
        if (!ver) {
          return reply.code(404).send({ error: 'version_not_found' });
        }

        const sha256 = ver.downloads.packageSha256;
        if (!sha256) {
          return reply.code(404).send({ error: 'sha256_not_available' });
        }

        return reply.type('text/plain; charset=utf-8').send(sha256);
      }
    );
  };
}