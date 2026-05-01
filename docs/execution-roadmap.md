# TAPython Tool Hub 前后端演进执行版

## 文档定位

这份文档用于把 [tool-hub-plan.md](../tool-hub-plan.md) 中的产品级方案，收敛为后续可以显式维护的工程执行版。

适用范围：

- 仓库目录重组。
- 前端、后端、共享包、内容处理包的职责划分。
- 从当前静态站点迁移到前后端协同架构的顺序。
- 保持现有静态 API、下载产物和 Agent 链路兼容。

不在这份文档中展开的内容：

- 最终 UI 视觉细节。
- 云厂商或内网基础设施的具体采购方案。
- 数据库字段级 DDL 设计。

## 当前判断

当前仓库已经具备“静态维护、基础可用”的发布模式，但目录职责仍然以单应用为中心，不适合继续直接承载以下能力：

- 网页投稿与审核。
- 登录、权限和审计。
- 数据库主流程。
- 后端发布任务编排。
- 共享 schema 和安装器能力。

如果继续在根目录叠加 `src/`、`scripts/`、`public/` 和未来 API 服务，会出现三个直接问题：

1. 前后端边界不清，类型和 API 形状容易漂移。
2. 生成逻辑只能通过脚本复用，无法成为后端发布流程的一部分。
3. 文档计划和工程落地会混在一起，后续维护难以收敛。

因此，这一阶段的目标不是“立刻重写站点”，而是先把仓库重组为可长期维护的前后端共存结构。

## 目标架构原则

### 1. 单仓多应用

继续使用单仓管理前端、后端、共享包和内容处理包，避免前后端分仓后 schema 漂移。

### 2. Node/TypeScript 统一栈

前端、后端、生成器、共享类型优先采用 Node/TypeScript，减少双栈协作成本。

### 3. 数据库进入主流程，但不废弃 Markdown 资产

数据库承担投稿、审核、发布状态和查询职责；Markdown、manifest、导出 README 和下载产物继续保留，作为导入导出和审计资产。

### 4. 已发布版本不可变

任何已发布版本一旦出库，对应 manifest、文件 hash 和下载产物都必须保持不可变；修订只能通过新版本完成。

### 5. 保持兼容接口稳定

以下接口和路径应视为兼容边界，迁移过程中不能轻易破坏：

- `/api/tools/index.json`
- `/api/tools/<tool>.json`
- `/downloads/<tool>/<version>/manifest.json`
- `/downloads/<tool>/<version>/tool.md`

## 实施前锁定决策

以下决策在 Phase A 开始前先锁定，避免目录迁移、后端骨架和数据库设计同时摇摆。

### 包管理器

当前执行阶段采用 npm workspaces。

原因：仓库已经存在 `package-lock.json`，第一轮迁移目标是降低结构风险，不同时切换包管理器。后续如果确实需要 pnpm 的 workspace 协议、安装性能或依赖隔离，可以单独发起包管理器迁移，不和 Phase A 混在一起。

### 后端框架

后端采用 Node/TypeScript，框架优先 Fastify。

原因：Fastify 的插件化、类型体验和轻量 API 服务模型适合内网先行、后续扩展公网能力；同时可以复用当前 Node 生成脚本生态和共享 TypeScript schema。

### 数据库

数据库优先 PostgreSQL。

原因：目标已经明确包含网页投稿、审核、发布、审计和后续统计，SQLite 虽然轻，但与多人协作和审核流目标存在张力。内网部署也应尽早建立备份、迁移和回滚习惯。

### 运行时 schema

共享契约需要同时提供 TypeScript 类型和运行时校验 schema，优先使用 Zod。

原因：TypeScript 只能约束编译期，不能校验网页投稿、文件导入、数据库读写和外部 Agent 调用的数据边界。

### 生成产物策略

Phase A 到 Phase D 期间继续保留当前静态生成产物路径；Phase E 之后逐步把生成动作交给后端发布任务，但兼容路径保持不变。

执行约束：

1. `/api/tools/index.json` 和 `/api/tools/<tool>.json` 的响应形状保持稳定。
2. `/downloads/<tool>/<version>/` 的 URL 结构保持稳定。
3. 数据库成为业务主流程后，每次发布仍必须导出 manifest、tool.md、README 和文件 hash 快照。

### Phase A 验收命令

Phase A 每次结构性提交前至少执行：

```bash
npm run generate:data
npm run build
```

验收标准：

- 前端构建通过。
- 生成脚本仍能从根目录 `data/` 读取工具源数据。
- 生成后的兼容 API 仍位于前端可访问的 `/api/tools/` 路径。
- 迁移期间不引入后端业务行为变化。

## 目标目录树

推荐将仓库收敛为以下结构：

```text
tapython-tool-hub/
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── pages/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   ├── services/
│   │   │   ├── features/
│   │   │   ├── styles/
│   │   │   └── main.tsx
│   │   ├── public/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vite.config.ts
│   └── api/
│       ├── src/
│       │   ├── app/
│       │   ├── routes/
│       │   ├── modules/
│       │   ├── services/
│       │   ├── repositories/
│       │   ├── jobs/
│       │   ├── storage/
│       │   ├── auth/
│       │   └── server.ts
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   ├── shared/
│   │   ├── src/
│   │   │   ├── schemas/
│   │   │   ├── dto/
│   │   │   ├── manifest/
│   │   │   ├── enums/
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── tooling/
│       ├── src/
│       │   ├── markdown/
│       │   ├── manifest/
│       │   ├── hashing/
│       │   ├── export/
│       │   ├── diff/
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
├── data/
│   ├── tool-docs/
│   └── fixtures/
├── docs/
│   ├── implementation-notes.md
│   └── execution-roadmap.md
├── scripts/
│   ├── dev/
│   ├── release/
│   └── migration/
├── package.json
├── tsconfig.base.json
├── pnpm-workspace.yaml 或 package-workspaces 配置
└── tool-hub-plan.md
```

## 包职责

### `apps/web`

职责：

- 工具库首页、详情页、版本对比页、投稿页、审核页、管理视图。
- 前端搜索、筛选、上传、审核操作交互。
- 读取兼容 JSON API 和后端业务 API。

边界：

- 不直接解析 Markdown 文件。
- 不直接计算 manifest、hash 或下载制品。
- 不持有业务真源类型定义，统一从 `packages/shared` 引入。

建议内部结构：

- `pages/`：页面级容器。
- `components/`：可复用 UI 组件。
- `features/`：按业务域组织，如 `catalog`、`submission`、`review`、`compare`。
- `services/`：HTTP 请求与数据适配层。
- `hooks/`：视图逻辑与状态组合。

### `apps/api`

职责：

- 登录、权限、投稿、审核、发布、下载授权、审计日志。
- 对数据库进行读写。
- 编排内容处理与产物导出任务。
- 对外暴露前端业务 API，并维持兼容 JSON 输出。

边界：

- 不重复定义 Tool schema。
- 不在路由层直接写 Markdown 解析或 hash 逻辑，应委托给 `packages/tooling`。

建议模块：

- `modules/tools`：工具主数据与详情查询。
- `modules/submissions`：投稿草稿、文件上传、校验。
- `modules/reviews`：审核流与审批记录。
- `modules/releases`：发布任务、版本冻结、下载产物导出。
- `modules/downloads`：下载地址、权限、签名或兼容静态路径。

### `packages/shared`

职责：

- 前后端共享类型。
- 运行时 schema 校验。
- manifest 和 diff 数据结构定义。
- 审核状态、风险等级、版本状态等枚举。

必须包含的内容：

- Tool summary/detail DTO。
- Submission DTO。
- Review DTO。
- Release DTO。
- manifest schema。
- 导出 API 响应 schema。

质疑点：

如果不在这一层统一 schema，当前 [src/types.ts](../src/types.ts) 会很快变成只服务前端的孤岛，后端和生成器会开始复制字段。

### `packages/tooling`

职责：

- Markdown front matter 解析。
- `@file:` 资源解析。
- 文件 hash 计算。
- manifest 组装。
- 下载产物导出。
- manifest diff 与 ZIP 文件级 diff。

来源：

- 当前 [scripts/generate-data.mjs](../scripts/generate-data.mjs) 中的核心逻辑应逐步下沉到这里。

边界：

- 不承担数据库读写。
- 不承担 HTTP 路由处理。

### `data/tool-docs`

职责：

- 作为现阶段内容资产区继续保留。
- 作为导入样例、回归测试样例和导出审计材料来源。

后续定位：

- 即使数据库成为业务主流程，这里也不建议被直接删除。
- 可以逐步从“唯一维护入口”演进为“导入源、样例源、审计快照源”。

### `scripts/`

职责：

- 保留开发与发布辅助命令。
- 承载一次性迁移脚本。
- 承载环境准备与本地导入导出脚本。

不再建议承担的职责：

- 作为唯一的正式发布入口。
- 长期承载核心业务逻辑。

## 迁移顺序

以下迁移顺序遵循“先整理边界，再迁移逻辑，再替换数据源”的原则。

### Phase A：工作区与目录重组

目标：先把仓库变成可容纳前后端的结构，但不打断现有站点运行。

执行项：

1. 根目录改造为 workspace 结构。
2. 将当前前端迁入 `apps/web`。
3. 将现有根目录 `src/`、`public/`、`vite.config.ts`、前端相关 tsconfig 调整为 `apps/web` 所有。
4. 保留 `data/`、`docs/`、`scripts/` 在根目录。
5. 增加 `packages/shared` 与 `packages/tooling` 空包骨架。

完成标准：

- 当前前端仍可本地运行。
- `npm run dev` 或新的 workspace dev 命令可以启动前端。
- 现有静态生成链路不被破坏。

### Phase B：前端拆层

目标：让前端在不接入后端之前，先具备可替换的数据访问层和页面结构。

执行项：

1. 将当前 [src/App.tsx](../src/App.tsx) 拆为页面容器。
2. 新增 `services/toolRegistry` 封装当前静态数据读取。
3. 新增 `hooks/` 和 `features/`，把筛选、选中、对比逻辑从页面视图中抽离。
4. 保持对 `/api/tools/*.json` 的兼容读取方式。

完成标准：

- 前端页面结构已不依赖单体组件。
- 后续切换 HTTP API 时，不需要重写页面结构。

### Phase C：共享契约下沉

目标：让前端、后端、生成器在同一组 schema 上工作。

执行项：

1. 将当前 [src/types.ts](../src/types.ts) 迁入 `packages/shared`。
2. 补充运行时校验 schema。
3. 为 manifest、submission、review、release 增补 DTO。
4. 前端改为从 `packages/shared` 引入类型。

完成标准：

- 前端、后端、内容处理包不再重复声明核心字段。
- 对外 JSON 结构可由共享 schema 验证。

### Phase D：内容处理逻辑抽包

目标：把当前脚本里的核心发布逻辑抽成后端可复用能力。

执行项：

1. 从 [scripts/generate-data.mjs](../scripts/generate-data.mjs) 抽离 Markdown 解析逻辑。
2. 抽离 hash、manifest 生成、导出产物、diff 逻辑到 `packages/tooling`。
3. 保留一个薄的 CLI 入口，供本地开发和 CI 继续调用。

完成标准：

- 生成器既可以被脚本调用，也可以被 `apps/api` 调用。
- 关键逻辑有独立测试入口，而不是只能通过整站构建验证。

### Phase E：后端骨架与数据库接入

目标：建立可用的业务 API，但先不强制前端全部切换。

执行项：

1. 在 `apps/api` 建立 Node/TypeScript 服务。
2. 先实现健康检查、工具列表读取、工具详情读取。
3. 接入数据库，最少落地 `tools`、`tool_versions`、`submissions`、`reviews`、`assets`、`audit_logs` 几类实体。
4. 先提供内部管理 API，不急于一次性完成全部后台能力。

完成标准：

- 后端可以在本地独立启动。
- 至少能通过后端读取工具列表和详情。
- 发布前的数据模型已固定到数据库。

### Phase F：投稿、审核、发布链路

目标：把“维护 Markdown 提交 git”迁移成“前端提交、后端校验、审核后发布”的业务流。

执行项：

1. 前端提供投稿表单和文件上传。
2. 后端实现草稿保存、校验报告、审核流转。
3. 审核通过后触发内容处理包，导出 manifest、tool.md、README 和下载产物。
4. 对已发布版本冻结，保证版本不可变。

完成标准：

- 可通过网页提交新工具或新版本。
- 审核通过后自动生成兼容 API 与下载产物。

### Phase G：兼容接口切换与静态链路收敛

目标：在不破坏旧前端和 Agent 的前提下，把兼容 JSON 和下载产物逐步交给后端发布流程。

执行项：

1. 后端继续生成 `/api/tools/index.json` 和 `/api/tools/<tool>.json` 等兼容产物。
2. 前端从静态 import 过渡为通过 service 调后端接口或兼容 JSON。
3. 将 `public/api`、`public/downloads` 从“手工/脚本主产物”逐步转成“发布任务产物”。

完成标准：

- 前端和 Agent 不感知主流程切换。
- 兼容接口与下载 URL 保持稳定。

## 包与阶段关系

```text
Phase A: workspace + apps/web + packages/shared + packages/tooling 骨架
Phase B: apps/web 内部拆层
Phase C: packages/shared 收口类型与 schema
Phase D: packages/tooling 收口生成与 diff 逻辑
Phase E: apps/api 建立服务与数据库接入
Phase F: apps/web + apps/api 打通投稿审核发布
Phase G: 兼容 API 和下载产物切换到发布任务
```

## 当前执行记录

### 2026-05-01 Phase A 已启动

已完成：

1. 锁定 npm workspaces、Fastify、PostgreSQL、Zod 和生成产物策略。
2. 将当前前端迁入 `apps/web`。
3. 新增 `apps/api`、`packages/shared`、`packages/tooling` 骨架。
4. 将静态生成输出迁移到 `apps/web/public`，保持部署后的 `/api/tools/` 和 `/downloads/` URL 兼容。
5. 通过 `npm run generate:data` 与 `npm run build` 验收。

下一步：

1. 继续 Phase B，拆分 `apps/web/src/App.tsx`。
2. 继续 Phase C，将 `apps/web/src/types.ts` 下沉到 `packages/shared`。
3. 在进入后端业务实现前，补数据库实体边界和投稿/审核/发布流设计。

### 2026-05-01 Phase B 已启动

已完成：

1. 将 `apps/web/src/App.tsx` 收敛为轻量入口，只负责渲染页面容器。
2. 新增 `apps/web/src/pages/ToolHubPage.tsx` 作为当前工具站主页面容器。
3. 新增 `apps/web/src/services/toolRegistry.ts`，集中封装当前静态工具注册表读取。
4. 新增 `apps/web/src/hooks/useToolFilters.ts`，把搜索、分类、风险等级和审核状态筛选逻辑从页面中抽离。
5. 新增 `apps/web/src/features/tools/display.ts` 与 `apps/web/src/features/tools/diff.ts`，集中维护工具展示颜色和版本/文件 diff 逻辑。
6. 保留 `apps/web/src/data/registry.ts` 作为兼容转发层，减少后续迁移时的引用断裂风险。
7. 通过 `npm run build` 验收。

下一步：

1. 继续从 `ToolHubPage` 中拆出 `ToolCatalog`、`ToolDetail`、`CompareView`、`SubmitGuide` 等 feature 组件。
2. 进入 Phase C，将 `apps/web/src/types.ts` 迁入 `packages/shared`，并引入运行时 schema。

### 2026-05-01 Phase C 已启动

已完成：

1. 将工具、版本、manifest、diff 相关 TypeScript 类型迁入 `packages/shared/src/types.ts`。
2. 新增 `packages/shared/src/schemas.ts`，用 Zod 定义风险等级、审核状态、manifest、工具详情和工具索引响应 schema。
3. 将 `packages/shared` 作为 `apps/web` 的 workspace 依赖。
4. 将 `apps/web/src/types.ts` 改为兼容转发层，减少现有引用断裂风险。
5. 将 web 内部关键模块改为从 `@tapython-tool-hub/shared` 引入类型。
6. 通过 `npm run typecheck -w @tapython-tool-hub/shared` 与 `npm run build` 验收。

下一步：

1. 继续拆分 `ToolHubPage` 内部 UI 组件，降低页面容器复杂度。
2. 让生成器使用 `packages/shared` 的 schema 校验输出 JSON，为后端发布任务复用做准备。
3. 补数据库实体边界和投稿/审核/发布流设计，再进入 `apps/api` 业务实现。

### 2026-05-01 Phase C 生成器契约校验

已完成：

1. 将 `packages/shared` 改为可构建包，输出 `dist/index.js` 与声明文件，供 Node 脚本和后续 API 服务复用。
2. 根命令在 `dev` 和 `generate:data` 前先构建 `@tapython-tool-hub/shared`，保证 workspace 包导出可用。
3. `scripts/generate-data.mjs` 复用 `toolDetailResponseSchema` 与 `toolIndexResponseSchema`，在写入 JSON 前校验工具详情和索引 payload。
4. `packages/*/dist/` 加入忽略规则，构建产物不进入版本库。
5. 通过 `npm run generate:data` 与 `npm run build` 验收。

下一步：

1. 补数据库实体边界与投稿/审核/发布流设计。
2. 在 `apps/api` 建立 Fastify 服务骨架，并复用 `packages/shared` 的 schema 作为响应契约。

### 2026-05-01 Phase D 已启动

已完成：

1. 将 `packages/tooling` 改为可构建包，输出 `dist/index.js` 与声明文件。
2. 新增 `packages/tooling/src/generateToolData.ts`，承载 Markdown/JSON 读取、front matter 解析、`@file:` 资源解析、hash 计算、manifest 生成、下载产物导出和 schema 校验。
3. 将 `scripts/generate-data.mjs` 收敛为薄 CLI，只负责装配仓库路径并调用 `generateToolData`。
4. 根命令 `generate:data` 在执行 CLI 前先构建 `@tapython-tool-hub/shared` 与 `@tapython-tool-hub/tooling`。
5. 通过 `npm run typecheck -w @tapython-tool-hub/tooling`、`npm run build -w @tapython-tool-hub/tooling`、`npm run generate:data` 与 `npm run build` 验收。

下一步：

1. 为 `packages/tooling` 增加 focused tests，覆盖路径越界、缺失 front matter、manifest schema 失败和 `@file:` 资源复制。
2. 补数据库实体边界与投稿/审核/发布流设计。
3. 进入 Phase E，在 `apps/api` 建立 Fastify 服务骨架并复用 `packages/shared` 与 `packages/tooling`。

### 2026-05-01 Phase E 已启动

已完成：

1. 在 `apps/api` 建立 Fastify 5 后端骨架，支持独立构建与启动。
2. 新增 `/health`，返回服务状态与 PostgreSQL 连接检查结果；未配置 `DATABASE_URL` 时以后端静态读取模式运行。
3. 新增 `/api/tools`、`/api/tools/index.json`、`/api/tools/<slug>` 与 `/api/tools/<slug>.json`，从当前兼容 JSON 产物读取工具索引和详情，并复用 `packages/shared` schema 校验。
4. 新增 PostgreSQL 初始迁移 `apps/api/db/migrations/001_initial.sql`，固定 `tools`、`tool_versions`、`submissions`、`reviews`、`assets`、`audit_logs` 实体边界。
5. 根命令新增 `dev:api`、`start:api`、`build:api`。
6. 通过 `npm audit --omit=dev`、`npm run build:api`、本地 API 启动和接口请求验收。

下一步：

1. 为 `apps/api` 增加 focused tests，覆盖 health、工具索引、工具详情和 404。
2. 补数据库迁移执行脚本，并决定本地开发 PostgreSQL 启动方式。
3. 将工具读取从纯静态 JSON 仓库扩展为数据库优先、静态 JSON fallback。

## 维护约定

后续涉及架构和目录调整时，优先更新这份文档，而不是只在聊天中口头确认。

建议维护规则：

1. 目标目录树变化时，先更新本文件，再改仓库结构。
2. 包职责变化时，更新“包职责”章节，而不是散落在提交说明里。
3. 迁移顺序有调整时，直接修改对应 Phase，避免额外复制多版计划。
4. 任何新增加的兼容边界，都补到“目标架构原则”中。

## 下一步建议

当前最合适的落地顺序不是直接写后端业务代码，而是先做以下三件事：

1. 把仓库改造成 workspace，并迁移现有前端到 `apps/web`。
2. 把 [src/types.ts](../src/types.ts) 和 [scripts/generate-data.mjs](../scripts/generate-data.mjs) 分别识别为共享契约和内容处理的拆分起点。
3. 先补一版数据库实体和发布流设计，再开始真正实现 `apps/api`。