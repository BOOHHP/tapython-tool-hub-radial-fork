# TAPython Tool Hub

[English README](README.md)

TAPython Tool Hub 是一个独立的编辑器工具分享站点，用于沉淀、检索、分发和对比 TAPython/Chameleon 编辑器工具。它分享的是可安装工具包，而不是 Skill 本身。

一期实现采用静态站点方案：工具数据可以维护为带 front matter 的 Markdown 文档，也兼容本地 JSON。构建时生成静态 API、导出的 Markdown、引用资源和下载清单，部署时可以直接放到公司局域网 nginx 或其他静态服务器上。

## 当前阶段

站点已经达到“静态维护、基础可用”阶段。工具作者或维护者可以通过修改仓库中的 Markdown 工具文档和引用文件来发布或更新工具，然后运行静态生成与构建流程。工具库浏览、详情页、Markdown 下载、manifest 查看和版本对比都不依赖后端服务。

当前阶段适合公司局域网或静态服务器部署，由维护者通过 git review 工具文档变更。在线上传、权限流、下载统计和数据库审核状态仍属于后续阶段。

## 当前功能

- 工具库首页：展示工具数量、审核状态、版本快照和部署模式。
- 搜索与筛选：支持按工具名称、标签、作者、Unreal API、控件 Aka、分类、风险等级和审核状态过滤。
- 工具详情：展示功能摘要、兼容版本、安装路径、挂载点、依赖、风险说明和安装步骤。
- SkillHub 风格详情页：详情与版本对比只在选中具体工具后展示。
- Manifest 查看：提供结构化 manifest 表格和 JSON 视图，便于后续接入 Agent 安装流程。
- 版本对比：支持 manifest 字段差异与文件清单/hash 差异对比。
- 投稿说明：说明工具包需要包含的文档、Chameleon UI JSON、Python 控制器、MenuConfig 片段、manifest 与版本信息。
- 静态 API：构建时生成 `/api/tools/index.json` 和 `/api/tools/<tool>.json`，并导出 `/downloads/<tool>/<version>/tool.md`。

## 技术栈

- 前端：Vite + React + TypeScript
- UI：Ant Design
- 数据源：`data/tool-docs/*.md` 和 `data/tools/*.json`
- 静态生成：Node.js 脚本
- 工作区：npm workspaces，包含 `apps/web`、后续 `apps/api` 和共享包
- 部署方式：静态文件托管，优先支持公司局域网 nginx

## 快速开始

```bash
npm install
npm run dev -- --host 127.0.0.1
```

默认开发地址：

```text
http://127.0.0.1:5174/
```

生产构建：

```bash
npm run build
```

构建会先执行 `npm run generate:data`，生成静态 API、可下载 Markdown、manifest 和引用资源，然后输出 `dist/`。

## 目录结构

```text
.
├── apps/
│   ├── web/                    # Vite + React 前端应用
│   │   ├── public/
│   │   │   ├── api/tools/       # 构建脚本生成的静态工具 API
│   │   │   └── downloads/       # 构建脚本生成的 manifest、Markdown、README 和引用资源
│   │   └── src/                 # 前端页面、注册表、样式和类型
│   └── api/                     # 后续 Node/TypeScript 后端服务
├── data/
│   ├── tools/                  # 工具源数据，每个工具一个 JSON
│   └── tool-docs/              # Markdown-first 工具文档和引用资源
├── docs/                       # 实施说明、接口约定和后续记录
├── packages/
│   ├── shared/                 # 后续共享 schema、DTO、manifest 和枚举包
│   └── tooling/                # 后续 Markdown 解析、hash、导出和 diff 包
├── scripts/
│   └── generate-data.mjs       # 从 Markdown/JSON 数据源生成 apps/web/public/api 与 downloads
├── tool-hub-plan.md            # 完整执行方案
└── tsconfig.base.json          # 共享 TypeScript 基础配置
```

## 数据流程

1. 在 `data/tool-docs/` 中维护工具 Markdown 文档，或在 `data/tools/` 中保留兼容 JSON 数据。
2. 运行 `npm run generate:data`。
3. 脚本生成：
   - `apps/web/public/api/tools/index.json`
   - `apps/web/public/api/tools/<tool-slug>.json`
   - `apps/web/public/downloads/<tool-slug>/<version>/manifest.json`
   - `apps/web/public/downloads/<tool-slug>/<version>/README.md`
   - `apps/web/public/downloads/<tool-slug>/<version>/tool.md`
   - 引用的 UI JSON、Python 和 MenuConfig 文件
4. 前端页面读取生成 API 展示工具库，并链接到生成后的 Markdown/manifest。

当前静态维护阶段推荐通过 git 审核变更，执行 `npm run build`，再将生成的 `dist/` 目录发布到静态服务器。

## 工具数据要求

每个工具至少需要描述：

- 基础信息：`slug`、名称、描述、作者、分类、标签、风险等级、审核状态。
- 兼容信息：Unreal Engine 版本、TAPython 版本、依赖插件。
- 安装信息：安装路径、Chameleon 挂载点、MenuConfig 片段。
- 版本信息：版本号、发布日期、变更说明、manifest、文件清单和 hash。
- 风险信息：会修改的对象、前置检查、后置检查、回滚建议。

当前 Markdown-first 示例工具包括 `Actor Rename Tool` 和 `Test Selection Audit Tool`，数据位于 `data/tool-docs/`。

## 部署说明

一期站点可以作为纯静态资源部署：

```bash
npm run build
```

将 `dist/` 发布到 nginx、内网文件服务器或云静态站点即可。由于 API 和下载 manifest 都在 `public/` 下构建进静态目录，部署时不需要后端服务。

后续如果需要真实上传、审核流、权限、版本归档和下载统计，会在当前 manifest-first 数据模型上演进到 Node/TypeScript 后端、PostgreSQL 和对象存储。

## 相关文档

- [tool-hub-plan.md](tool-hub-plan.md)：完整站点方案与阶段计划。
- [docs/execution-roadmap.md](docs/execution-roadmap.md)：前后端执行路线、目标目录树、包职责和迁移顺序。
- [docs/implementation-notes.md](docs/implementation-notes.md)：一期实现记录和接口说明。