# TAPython Tool Hub

[English README](README.md)

TAPython Tool Hub 是一个独立的编辑器工具分享站点，用于沉淀、检索、分发和对比 TAPython/Chameleon 编辑器工具。它分享的是可安装工具包，而不是 Skill 本身。

当前实现已经演进为前后端共存的 hybrid 工作区：工具数据仍然可以维护为带 front matter 的 Markdown 文档，也兼容本地 JSON；前端运行时通过 Fastify API 读取工具库，后端负责提供兼容工具 JSON、下载产物和投稿/审核/发布链路。

## 当前阶段

项目已经完成 Phase G 的前后端迁移和完整 CLI 安装计划（Phase 1–5）：仓库采用 npm workspace，包含 `apps/web`、`apps/api`、`packages/shared`、`packages/tooling` 和 `packages/cli`。

当前推荐运行模式是 API-backed：前端通过后端读取工具目录、详情和 downloads；生成的静态 API/downloads 仍作为兼容产物保留，方便旧 Agent、静态消费方或无后端部署场景使用。

配置 `DATABASE_URL` 时，投稿和审核记录写入 PostgreSQL；未配置数据库时，API 会退回本地文件系统存储，方便本地试用投稿流。

## 安装通道

站点为每个工具提供三种安装方式，同时服务人类用户和 AI 助手：

### 方式一：复制提示词给 AI 助手

每个工具详情页提供可复制的 AI 安装提示词。粘贴给任意 AI 助手（Copilot、Claude、Kimi 等），助手会自动检查 CLI、读取 API、校验 hash、展示安装计划，等你确认后再写入文件。

### 方式二：终端 CLI 安装

```bash
# 安装 CLI（macOS/Linux）
curl -fsSL https://<hub-domain>/install/cli.sh | bash -s -- --cli-only

# 安装 CLI（Windows PowerShell）
irm https://<hub-domain>/install/cli.ps1 | iex

# 安装工具
tapython-tool-hub install <tool-slug> --hub https://<hub-domain> --project "<Project>"
```

CLI 默认先展示安装计划并要求确认；使用 `--dry-run` 获取预览，或 `--yes` 进行无人值守安装。

### 方式三：ZIP 包安装

下载完整包（manifest + README + tool.md + 所有资源），适合离线安装、隔离环境或手动审计。ZIP 页面展示 sha256、大小和版本号。

## CLI 命令

```bash
tapython-tool-hub --version
tapython-tool-hub hub ping --hub <url>
tapython-tool-hub search <query> --hub <url>
tapython-tool-hub show <slug> --hub <url>
tapython-tool-hub plan <slug> --hub <url> --project <path>
tapython-tool-hub download <slug> --hub <url> --output <dir>
tapython-tool-hub verify --manifest <path> --package <path>
tapython-tool-hub install <slug> --hub <url> --project <path> [--dry-run] [--yes]
tapython-tool-hub uninstall <slug> --project <path>
```

所有命令支持 `--json` 结构化输出，便于 AI Agent 解析。

## 当前功能

- 工具库首页：展示工具数量、审核状态、版本快照和部署模式。
- 搜索与筛选：支持按工具名称、标签、作者、Unreal API、控件 Aka、分类、风险等级和审核状态过滤。
- 工具详情：展示功能摘要、兼容版本、安装路径、挂载点、依赖、风险说明和安装步骤。
- 三通道安装指南：AI 提示词、CLI 命令（自动检测平台）、ZIP 包（含 sha256/size）。
- CLI 包（`packages/cli`）：search、show、plan、download、verify、install、uninstall 命令。
- 安装安全：sha256 校验（包级 + 逐文件）、路径穿越防护、覆盖前备份、失败回滚、安装账本追踪。
- MenuConfig.json 结构化合并（JSON 解析，非字符串拼接）。
- 版本对比：支持 manifest 字段差异与文件清单/hash 差异对比。
- 投稿/审核工作台：支持提交 Markdown-first 工具文档和引用文本资源。
- 后端校验：投稿进入审核前复用 `packages/tooling` 生成校验报告。
- 审核发布：审核通过后导出兼容 API、manifest、README、tool.md 和 downloads 资源。
- Agent 友好 API 端点：`/api/tools/:slug/install-prompt`、`/api/tools/:slug/versions/:version/install-plan-template`、`/api/tools/:slug/versions/:version/package.sha256`。
- ZIP 元数据：`packageAvailable` 标记（不可用时附原因）、`packageSha256`、`packageSize`。

## 技术栈

- 前端：Vite + React + TypeScript
- UI：Ant Design
- 数据源：`data/tool-docs/*.md` 和 `data/tools/*.json`
- 后端：Fastify + TypeScript
- CLI：零外部依赖 Node.js CLI（`packages/cli`），仅使用 `node:*` 模块 + `@tapython-tool-hub/shared`
- 数据库：配置 `DATABASE_URL` 时使用 PostgreSQL 存储投稿/审核；本地无数据库时使用文件 fallback
- 共享契约：`packages/shared` 中的 Zod schema 和 TypeScript DTO
- 内容处理：`packages/tooling`
- 工作区：npm workspaces，包含 `apps/web`、`apps/api`、`packages/shared`、`packages/tooling` 和 `packages/cli`
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

CLI 构建和测试：

```bash
npm run build-cli
npm run test -w @tapython-tool-hub/cli
```

## 常用命令

| 命令 | 用途 |
|------|------|
| `npm run dev:api` | 构建 shared/tooling 包，然后以 watch 模式启动 Fastify API。 |
| `npm run dev` | 构建 `packages/shared`，然后启动 Vite 前端。 |
| `npm run generate:data` | 从 `data/` 重新生成兼容 API/downloads 产物。 |
| `npm run build` | 重新生成数据并构建前端到 `dist/`。 |
| `npm run build:api` | 构建 `packages/shared`、`packages/tooling` 和 `apps/api`。 |
| `npm run build-cli` | 构建 `packages/shared` 和 `packages/cli`。 |
| `npm test -w @tapython-tool-hub/api` | 运行 API/workflow focused tests。 |
| `npm test -w @tapython-tool-hub/cli` | 运行 CLI 单元测试（hash、zip、paths、menuConfig、ledger）。 |
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
│   │   │   ├── downloads/       # 构建脚本生成的 manifest、Markdown、README、ZIP 包
│   │   │   └── install/         # CLI 安装脚本（cli.sh、cli.ps1）
│   │   └── src/                 # 前端页面、注册表、样式和类型
│   └── api/                     # Fastify 后端服务和 API 路由
├── data/
│   ├── tools/                  # 工具源数据，每个工具一个 JSON
│   └── tool-docs/              # Markdown-first 工具文档和引用资源
├── docs/                       # 实施说明、接口约定和后续记录
├── packages/
│   ├── shared/                 # 共享 schema、DTO、manifest 和枚举包
│   ├── tooling/                # Markdown 解析、hash、导出和 diff 包
│   └── cli/                    # tapython-tool-hub CLI（search、install、verify、uninstall）
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
   - `/downloads/<tool-slug>/<version>/<tool-slug>-<version>.zip`
4. 投稿通过 `/api/submissions` 进入后端，经过 `packages/tooling` 校验、审核后导出为 Markdown/source 资产和兼容生成产物。

## API 路由

| 方法 | 路径 | 用途 |
|------|------|------|
| `GET` | `/health` | API 和可选数据库健康检查。 |
| `GET` | `/api/tools` | 兼容工具索引。 |
| `GET` | `/api/tools/index.json` | 前端和 Agent 使用的兼容工具索引。 |
| `GET` | `/api/tools/<slug>` | 兼容工具详情。 |
| `GET` | `/api/tools/<slug>.json` | 前端和 Agent 使用的兼容工具详情。 |
| `GET` | `/api/tools/<slug>/install-prompt` | 返回纯文本 AI 安装提示词。 |
| `GET` | `/api/tools/<slug>/versions/<ver>/install-plan-template` | 结构化安装计划（manifest、URL、风险提示、CLI 命令）。 |
| `GET` | `/api/tools/<slug>/versions/<ver>/package.sha256` | 返回纯文本包 sha256。 |
| `GET` | `/downloads/*` | 兼容 manifest、README、tool Markdown、ZIP 包和引用资源。 |
| `GET` | `/api/submissions` | 投稿列表。 |
| `POST` | `/api/submissions` | 创建并校验 Markdown-first 投稿。 |
| `GET` | `/api/submissions/<id>` | 查看单个投稿。 |
| `POST` | `/api/submissions/<id>/review` | 审核通过、拒绝或要求修改。 |

投稿和审核路由当前面向可信内网试用；如果要暴露到非可信网络，需要先补鉴权。

## CLI 安全模型

CLI 执行以下安全不变量：

1. 默认只生成安装计划，不写入文件。
2. 实际写入需要交互确认或显式传入 `--yes`。
3. 只允许写入 manifest 声明的路径（`installPath` + `menuConfigMerge.target`）。
4. 写入前校验 ZIP 包级 sha256。
5. 解压后逐文件校验 sha256 与 manifest 一致。
6. 覆盖已有文件前生成 `.bak` 备份。
7. 在 `<project>/TA/TAPython/.tool-hub/installed.json` 维护安装账本，支持卸载/回滚。
8. 写入失败时自动回滚（恢复备份或删除新文件）。
9. MenuConfig.json 使用 JSON 结构化合并，不做字符串拼接。
10. HTTP 客户端限制下载只来自指定 hub 域名。

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
   - `apps/web/public/downloads/<tool-slug>/<version>/<tool-slug>-<version>.zip`
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
npm test -w @tapython-tool-hub/cli
npm test -w @tapython-tool-hub/api
npm run build:api
npm run build-cli
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
- CLI 当前为 `private: true`；公开发布需要配置 npm publish 流程。

## 相关文档

- [tool-hub-plan.md](tool-hub-plan.md)：完整站点方案与阶段计划。
- [docs/cli-installation-plan.md](docs/cli-installation-plan.md)：CLI 设计、安装通道和实施阶段。
- [docs/execution-roadmap.md](docs/execution-roadmap.md)：前后端执行路线、目标目录树、包职责和迁移顺序。
- [docs/implementation-notes.md](docs/implementation-notes.md)：当前实现记录和接口说明。