# TAPython Tool Hub

[English README](README.md)

TAPython Tool Hub 是一个独立的编辑器工具分享站点，用于沉淀、检索、分发和对比 TAPython/Chameleon 编辑器工具。它分享的是可安装工具包，而不是 Skill 本身。

当前实现已经演进为前后端共存的 hybrid 工作区：工具数据仍然可以维护为带 front matter 的 Markdown 文档，也兼容本地 JSON；前端运行时通过 Fastify API 读取工具库，后端负责提供兼容工具 JSON、下载产物和投稿/审核/发布链路。

## 当前阶段

项目已经完成 Phase G 的前后端迁移：仓库采用 npm workspace，包含 `apps/web`、`apps/api`、`packages/shared` 和 `packages/tooling`。

当前推荐运行模式是 API-backed：前端通过后端读取工具目录、详情和 downloads；生成的静态 API/downloads 仍作为兼容产物保留，方便旧 Agent、静态消费方或无后端部署场景使用。

配置 `DATABASE_URL` 时，投稿和审核记录写入 PostgreSQL；未配置数据库时，API 会退回本地文件系统存储，方便本地试用投稿流。

## 当前功能

- 工具库首页：展示工具数量、审核状态、版本快照和部署模式。
- 搜索与筛选：支持按工具名称、标签、作者、Unreal API、控件 Aka、分类、风险等级和审核状态过滤。
- 工具详情：展示功能摘要、兼容版本、安装路径、挂载点、依赖、风险说明和安装步骤。
- SkillHub 风格详情页：详情与版本对比只在选中具体工具后展示。
- Manifest 查看：提供结构化 manifest 表格和 JSON 视图，便于后续接入 Agent 安装流程。
- 版本对比：支持 manifest 字段差异与文件清单/hash 差异对比。
- 投稿/审核工作台：支持提交 Markdown-first 工具文档和引用文本资源。
- 后端校验：投稿进入审核前复用 `packages/tooling` 生成校验报告。
- 审核发布：审核通过后导出兼容 API、manifest、README、tool.md 和 downloads 资源。
- 后端兼容 API：`/api/tools/index.json` 和 `/api/tools/<tool>.json`。
- 后端兼容下载：`/downloads/<tool>/<version>/manifest.json`、`README.md` 和 `tool.md`。

## 技术栈

- 前端：Vite + React + TypeScript
- UI：Ant Design
- 数据源：`data/tool-docs/*.md` 和 `data/tools/*.json`
- 后端：Fastify + TypeScript
- 数据库：配置 `DATABASE_URL` 时使用 PostgreSQL 存储投稿/审核；本地无数据库时使用文件 fallback
- 共享契约：`packages/shared` 中的 Zod schema 和 TypeScript DTO
- 内容处理：`packages/tooling`
- 工作区：npm workspaces，包含 `apps/web`、`apps/api`、`packages/shared` 和 `packages/tooling`
- 部署方式：优先 API-backed 内网部署，同时保留静态产物兼容链路

## 快速开始

```bash
npm install
npm run dev:api
npm run dev
```

默认开发地址：

```text
API: http://127.0.0.1:8787
Web: http://localhost:5174/ 或 Vite 实际提示的备用端口
```

前端读取 `VITE_API_BASE_URL`；未配置时默认使用 `http://127.0.0.1:8787`。

生产构建：

```bash
npm run build
```

构建会先执行 `npm run generate:data`，生成静态 API、可下载 Markdown、manifest 和引用资源，然后输出 `dist/`。

API 构建和 focused tests：

```bash
npm run build:api
npm test -w @tapython-tool-hub/api
```

## 常用命令

| 命令 | 用途 |
|------|------|
| `npm run dev:api` | 构建 shared/tooling 包，然后以 watch 模式启动 Fastify API。 |
| `npm run dev` | 构建 `packages/shared`，然后启动 Vite 前端。 |
| `npm run generate:data` | 从 `data/` 重新生成兼容 API/downloads 产物。 |
| `npm run build` | 重新生成数据并构建前端到 `dist/`。 |
| `npm run build:api` | 构建 `packages/shared`、`packages/tooling` 和 `apps/api`。 |
| `npm test -w @tapython-tool-hub/api` | 运行 API/workflow focused tests。 |
| `npm run start:api` | 构建 API 依赖后启动编译产物。 |

## 配置项

API 从环境变量读取配置：

| 变量 | 默认值 | 用途 |
|------|--------|------|
| `API_HOST` | `127.0.0.1` | Fastify 监听地址。 |
| `API_PORT` | `8787` | Fastify 监听端口。 |
| `DATABASE_URL` | 未配置 | PostgreSQL 连接串；未配置时投稿使用文件 fallback。 |
| `TOOL_DATA_ROOT` | `data/tools` | JSON 工具源数据目录。 |
| `TOOL_DOCS_ROOT` | `data/tool-docs` | Markdown-first 工具源数据目录。 |
| `TOOL_API_ROOT` | `apps/web/public/api/tools` | 兼容工具 API 生成目录。 |
| `TOOL_DOWNLOAD_ROOT` | `apps/web/public/downloads` | 兼容 downloads 生成目录。 |
| `SUBMISSION_ROOT` | `.tapython-tool-hub/submissions` | 投稿文件 fallback 存储目录。 |

前端读取：

| 变量 | 默认值 | 用途 |
|------|--------|------|
| `VITE_API_BASE_URL` | `http://127.0.0.1:8787` | 前端请求 API 和 downloads 的基础地址。 |

## 可选 PostgreSQL

本地试用不强制 PostgreSQL。未配置 `DATABASE_URL` 时，投稿记录会写入 `.tapython-tool-hub/submissions`。

如需使用 PostgreSQL，先创建数据库、应用初始 schema，再带 `DATABASE_URL` 启动 API：

```bash
createdb tapython_tool_hub
psql "$DATABASE_URL" -f apps/api/db/migrations/001_initial.sql
DATABASE_URL="postgres://localhost/tapython_tool_hub" npm run dev:api
```

当前 SQL migration 是幂等的。专门的迁移执行脚本计划在 Phase H 中补齐。

## 目录结构

```text
.
├── apps/
│   ├── web/                    # Vite + React 前端应用
│   │   ├── public/
│   │   │   ├── api/tools/       # 构建脚本生成的静态工具 API
│   │   │   └── downloads/       # 构建脚本生成的 manifest、Markdown、README 和引用资源
│   │   └── src/                 # 前端页面、注册表、样式和类型
│   └── api/                     # Fastify 后端服务和 API 路由
├── data/
│   ├── tools/                  # 工具源数据，每个工具一个 JSON
│   └── tool-docs/              # Markdown-first 工具文档和引用资源
├── docs/                       # 实施说明、接口约定和后续记录
├── packages/
│   ├── shared/                 # 共享 schema、DTO、manifest 和枚举包
│   └── tooling/                # Markdown 解析、hash、导出和 diff 包
├── scripts/
│   └── generate-data.mjs       # 从 Markdown/JSON 数据源生成 apps/web/public/api 与 downloads
├── tool-hub-plan.md            # 完整执行方案
└── tsconfig.base.json          # 共享 TypeScript 基础配置
```

## 运行时数据流程

1. 前端调用 `VITE_API_BASE_URL` 指向的后端 API。
2. 后端从生成产物读取并提供兼容工具 API：
   - `/api/tools/index.json`
   - `/api/tools/<tool-slug>.json`
3. 后端从生成下载目录读取并提供兼容 downloads：
   - `/downloads/<tool-slug>/<version>/manifest.json`
   - `/downloads/<tool-slug>/<version>/README.md`
   - `/downloads/<tool-slug>/<version>/tool.md`
4. 投稿通过 `/api/submissions` 进入后端，经过 `packages/tooling` 校验、审核后导出为 Markdown/source 资产和兼容生成产物。

## API 路由

| 方法 | 路径 | 用途 |
|------|------|------|
| `GET` | `/health` | API 和可选数据库健康检查。 |
| `GET` | `/api/tools` | 兼容工具索引。 |
| `GET` | `/api/tools/index.json` | 前端和 Agent 使用的兼容工具索引。 |
| `GET` | `/api/tools/<slug>` | 兼容工具详情。 |
| `GET` | `/api/tools/<slug>.json` | 前端和 Agent 使用的兼容工具详情。 |
| `GET` | `/downloads/*` | 兼容 manifest、README、tool Markdown 和引用资源。 |
| `GET` | `/api/submissions` | 投稿列表。 |
| `POST` | `/api/submissions` | 创建并校验 Markdown-first 投稿。 |
| `GET` | `/api/submissions/<id>` | 查看单个投稿。 |
| `POST` | `/api/submissions/<id>/review` | 审核通过、拒绝或要求修改。 |

投稿和审核路由当前面向可信内网试用；如果要暴露到非可信网络，需要先补鉴权。

## 投稿审核流程

1. 打开前端，切换到投稿页。
2. 粘贴包含合法 front matter 的 Markdown-first 工具文档。
3. 上传 Markdown 中 `@file:` 引用的文本资源，例如 Chameleon UI JSON、Python Controller 或 MenuConfig 片段。
4. 提交后，API 通过 `packages/tooling` 执行校验。
5. 校验通过后进入 `pending`；校验失败则保存为 `draft` 并显示校验问题。
6. 审核者在工作台通过或拒绝投稿。
7. 审核通过后导出源码文件到 `data/tool-docs/<slug>/`，并重新生成兼容 API/downloads 产物。

已发布版本不可变。同一 slug 和 version 已存在时，投稿会在校验阶段被拒绝。

## 源数据流程

1. 在 `data/tool-docs/` 中维护工具 Markdown 文档，或在 `data/tools/` 中保留兼容 JSON 数据。
2. 运行 `npm run generate:data`。
3. 脚本生成：
   - `apps/web/public/api/tools/index.json`
   - `apps/web/public/api/tools/<tool-slug>.json`
   - `apps/web/public/downloads/<tool-slug>/<version>/manifest.json`
   - `apps/web/public/downloads/<tool-slug>/<version>/README.md`
   - `apps/web/public/downloads/<tool-slug>/<version>/tool.md`
   - 引用的 UI JSON、Python 和 MenuConfig 文件
4. 后端读取生成 API/downloads 产物，并通过稳定兼容路由对外提供。

当前 hybrid 阶段推荐同时运行 API 和 web。静态产物仍是兼容输出，在无后端场景下仍可单独部署用于工具浏览。

## 工具数据要求

每个工具至少需要描述：

- 基础信息：`slug`、名称、描述、作者、分类、标签、风险等级、审核状态。
- 兼容信息：Unreal Engine 版本、TAPython 版本、依赖插件。
- 安装信息：安装路径、Chameleon 挂载点、MenuConfig 片段。
- 版本信息：版本号、发布日期、变更说明、manifest、文件清单和 hash。
- 风险信息：会修改的对象、前置检查、后置检查、回滚建议。

当前 Markdown-first 示例工具包括 `Actor Rename Tool` 和 `Test Selection Audit Tool`，数据位于 `data/tool-docs/`。

## 测试与验证

修改代码前后建议先跑最小相关检查，再跑完整构建：

```bash
npm test -w @tapython-tool-hub/api
npm run build:api
npm run build
```

依赖安全检查：

```bash
npm audit --omit=dev
```

当前前端构建可能提示 Ant Design 相关 chunk 较大，这是已知现象；代码拆包属于后续 UI 优化。

## 部署说明

推荐的内网部署模式是 API + web build：

```bash
npm run build:api
npm run build
npm run start:api
```

将 `dist/` 交给 nginx 或其他静态服务器，并把 API/downloads 请求转发到 `apps/api`；也可以通过 `VITE_API_BASE_URL` 指向独立 API 主机。

纯静态部署仍可用于工具浏览和 downloads，但投稿、审核和发布流需要后端 API。

下一阶段建议执行 execution roadmap 中的 Phase H：补数据库迁移脚本、本地 PostgreSQL 启动说明、route tests、PostgreSQL-first 工具读取，以及审核发布动作的最小鉴权。

## 已知缺口

- 还没有 migration runner；使用 PostgreSQL 时需要手动执行 `apps/api/db/migrations/001_initial.sql`。
- 工具读取仍基于生成 JSON 产物；PostgreSQL-first 工具读取计划后续补齐。
- 投稿审核/发布路由尚未做登录或权限校验。
- tools、downloads、health 和 submission HTTP 错误响应的 route-level tests 仍待补齐。
- 投稿审核工作台已经可用，但继续扩展前建议拆成更小的前端组件。

## 相关文档

- [tool-hub-plan.md](tool-hub-plan.md)：完整站点方案与阶段计划。
- [docs/execution-roadmap.md](docs/execution-roadmap.md)：前后端执行路线、目标目录树、包职责和迁移顺序。
- [docs/implementation-notes.md](docs/implementation-notes.md)：当前实现记录和接口说明。