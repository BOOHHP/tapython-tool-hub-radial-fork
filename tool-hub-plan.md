# TAPython Tool Hub 独立站点执行方案

## 目标

建设一个独立的 TAPython 编辑器工具分享网站，核心不是分享 Skill，而是分享可被美术、TA、技术美术直接下载和安装的编辑器工具包。

工具包以文档、工具文件、manifest、版本记录和下载制品为核心资产。站点需要支持公司局域网部署，也能演进到在线云服务器部署。

当前实现已经进入“静态维护、基础可用”阶段：通过仓库中的 Markdown 工具文档维护工具数据，构建时生成站点 API、manifest、Markdown 下载和引用资源。现阶段不需要后端服务即可完成工具浏览、详情查看、安装说明、manifest 查看和版本对比。

核心使用流程：

1. 工具作者发布自己开发的 TAPython/Chameleon 编辑器工具。
2. 使用者通过网页搜索、分类筛选或 Agent 推荐找到工具。
3. 使用者查看工具适用版本、风险、安装方式和版本记录。
4. 使用者手动下载文档/ZIP，或让 Agent 读取 manifest 后安装到 UE 项目目录。
5. 后续工具更新时，使用者可以比较版本差异并决定是否升级。

当前静态维护流程：

1. 维护者在 `data/tool-docs/` 中新增或更新工具 Markdown。
2. 长 UI JSON、Python Controller 和 MenuConfig 通过 `@file:` 引用外部文件。
3. 执行 `npm run build` 生成静态 API 与下载制品并验证前端。
4. 通过 git review 审核变更。
5. 将 `dist/` 发布到公司局域网 nginx 或其他静态服务器。

## 产品边界

Tool Hub 分享的是最终可安装的编辑器工具，不是 Skill。

Skill 可以辅助生成工具、导出工具文档、查询 Unreal Python API，但 Tool Hub 的平台职责是发布、索引、下载、校验、安装指引和版本对比。

## 用户角色

| 角色 | 目标 | 关键需求 |
|------|------|----------|
| 工具作者 | 发布和维护工具 | 上传工具、填写版本、说明兼容性、记录变更 |
| 美术/TA 使用者 | 找到并安装工具 | 搜索、筛选、查看风险、下载、安装指引 |
| 审核者 | 保证工具质量 | 校验 manifest、代码结构、风险提示、版本记录 |
| Agent/安装器 | 自动辅助安装 | 读取 JSON/manifest、校验 hash、生成安装 diff |
| 管理员 | 维护平台 | 部署、权限、备份、审核策略、版本归档 |

## 工具包标准

一个工具包至少包含：

- 工具说明文档：`README.md` 或站点中的工具详情 Markdown。
- 菜单注册片段：`MenuConfig.snippet.json`。
- Chameleon UI：`<ToolName>.json`。
- Python Controller：`<ToolName>.py`。
- Python 包标记：`__init__.py`。
- 工具清单：`manifest.json`。

推荐 ZIP 结构：

```text
ActorRenameTool-1.0.0.zip
└── ActorRenameTool/
    ├── ActorRenameTool.json
    ├── ActorRenameTool.py
    ├── __init__.py
    ├── README.md
    ├── manifest.json
    └── MenuConfig.snippet.json
```

## Markdown-first 发布模型

Tool Hub 的长期维护方式建议从“维护站点表单或手写 JSON”调整为“维护工具 Markdown 文档”。Markdown 是人类查阅、审核和 Agent 读取的主要资产，`manifest.json`、站点 API、搜索索引和下载包由构建脚本生成。

### 两种文档形态

| 模式 | 适用场景 | 说明 |
|------|----------|------|
| 单文件模式 | 小工具、教学示例、快速分享 | Markdown 内直接包含 MenuConfig、Chameleon UI JSON、Python Controller、安装说明和风险说明 |
| 混合模式 | UI JSON 或 Python 较长、多人维护、需要代码审查 | Markdown 存放元数据、说明、安装、风险和版本历史；UI JSON/Python/MenuConfig 作为外部文件由 Markdown 引用 |

两种模式生成同一套站点数据结构，因此搜索、详情页、manifest、版本对比和 Agent 安装链路保持一致。

### Markdown front matter

每份工具 Markdown 顶部必须有 front matter，用于生成结构化数据：

```yaml
---
schemaVersion: "1.0.0"
slug: actor-rename-tool
name: ActorRenameTool
displayName: Actor Rename Tool
version: "1.1.0"
author: TA Team
status: approved
description: 场景 Actor 批量重命名与 Tag 管理工具
category: level-editing
riskLevel: medium
sourceMode: markdown-with-external-files
tags: [actor, batch-rename, tag, chameleon]
compatibility:
  unrealEngine: ["5.3", "5.4", "5.5"]
  tapython: ["1.2+"]
  plugins: ["TAPython"]
mountPoint: OnToolBarChameleon
installPath: <Project>/TA/TAPython/Python/ActorRenameTool/
entryJson: ActorRenameTool/ActorRenameTool.json
---
```

正文继续面向使用者书写，包含快速开始、文件清单、架构简述、MenuConfig、View、Controller、使用说明、注意事项、版本历史和 Agent 安装指令。

### 外部文件引用

当 UI JSON 或 Python Controller 过长时，Markdown 使用 `@file:` 引用同目录文件：

````markdown
```json chameleon-ui path=ActorRenameTool/ActorRenameTool.json
@file:ActorRenameTool.json
```

```python controller path=ActorRenameTool/ActorRenameTool.py
@file:ActorRenameTool.py
```
````

构建脚本读取引用文件，计算 hash/size，并写入 manifest 的 `files[]`。这样文档仍然是发布入口，但大型代码文件可以独立维护。

外部文件引用必须提供 `path=<安装相对路径>`，生成器会把真实文件复制到 `/downloads/<tool>/<version>/` 下的对应路径，并限制读取和写入都不能越过工具文档目录或下载目录。

### 构建产物

Markdown-first 输入会生成：

- `/api/tools/index.json`
- `/api/tools/<tool>.json`
- `/downloads/<tool>/<version>/manifest.json`
- `/downloads/<tool>/<version>/README.md`
- `/downloads/<tool>/<version>/tool.md`
- `/downloads/<tool>/<version>/<referenced asset files>`
- 可选 ZIP 包

Agent 可以直接读取 Markdown，也可以读取生成的 API/manifest。推荐安装前始终展示目标路径、文件写入列表、hash 校验结果和 MenuConfig 合并 diff。

## Manifest 数据模型

`manifest.json` 是 Agent、安装器和版本对比的核心依据。

```json
{
  "schemaVersion": "1.0.0",
  "name": "ActorRenameTool",
  "displayName": "Actor Rename Tool",
  "version": "1.0.0",
  "author": "TeamName",
  "description": "场景 Actor 批量重命名与 Tag 管理工具",
  "category": "level-editing",
  "tags": ["actor", "batch-rename", "tag"],
  "compatibility": {
    "unrealEngine": ["5.3", "5.4", "5.5"],
    "tapython": ["1.2+"],
    "plugins": []
  },
  "dependencies": [],
  "mountPoint": "OnToolBarChameleon",
  "installPath": "<Project>/TA/TAPython/Python/ActorRenameTool/",
  "entryJson": "ActorRenameTool/ActorRenameTool.json",
  "riskLevel": "medium",
  "files": [
    {
      "path": "ActorRenameTool/ActorRenameTool.json",
      "sha256": "...",
      "size": 0
    },
    {
      "path": "ActorRenameTool/ActorRenameTool.py",
      "sha256": "...",
      "size": 0
    }
  ],
  "menuConfigMerge": {
    "target": "<Project>/TA/TAPython/UI/MenuConfig.json",
    "mountPoint": "OnToolBarChameleon",
    "itemsToAdd": [
      {
        "name": "Actor Rename Tool",
        "ChameleonTools": "../Python/ActorRenameTool/ActorRenameTool.json",
        "ExtensionHookName": "OnToolBarChameleon"
      }
    ]
  },
  "preInstallChecks": [
    "确认项目已安装 TAPython",
    "确认 MenuConfig.json 可写",
    "确认目标目录不存在同名未备份工具"
  ],
  "postInstallSteps": [
    "Reload TAPython 或重启 UE 编辑器",
    "在 Chameleon 工具栏中确认工具入口可见"
  ],
  "uninstallSteps": [
    "删除 <Project>/TA/TAPython/Python/ActorRenameTool/",
    "从 MenuConfig.json 移除对应 items 项"
  ],
  "createdAt": "2026-04-30",
  "updatedAt": "2026-04-30"
}
```

## 工具文档规范

以 `plan/tool_share/ActorRenameTool.md` 为首个样例，后续每个工具文档建议包含以下章节：

1. 工具简介：说明工具用途、适用岗位和解决的问题。
2. 快速开始：复制文件、合并菜单配置、Reload TAPython。
3. 文件清单：列出 UI JSON、Python Controller、`__init__.py`、manifest。
4. 兼容性：UE 版本、TAPython 版本、插件依赖。
5. 风险等级：说明是否批量修改 Actor、资产、文件或项目配置。
6. 安装步骤：手动安装与 Agent 安装分开说明。
7. Router：`MenuConfig.json` 片段。
8. View：Chameleon UI JSON。
9. Controller：Python 代码。
10. 控件映射：`Aka`、控件类型、用途、绑定方法。
11. 方法说明：方法名、触发方式、功能、风险。
12. 使用说明：面向普通使用者的操作步骤。
13. 版本历史：每个版本的变更摘要、兼容性变化、升级提示。
14. 卸载方式：删除文件和回滚 MenuConfig 的步骤。
15. Agent 安装指令：让 Agent 能读取 manifest 并生成安装预览。

## 站点信息架构

```text
/
├── tools
│   ├── index
│   ├── <tool>
│   └── <tool>/versions
├── compare
├── submit
├── downloads
├── api
│   └── tools
│       ├── index.json
│       └── <tool>.json
└── admin          # V1/V2，可选
```

### 首页 `/`

- 展示 Tool Hub 定位。
- 展示最新工具、常用分类、最近更新。
- 展示核心安装流程：查找工具、下载、校验、安装、Reload。
- 展示当前部署模式：公司局域网或云端。

### 工具目录 `/tools`

- 工具卡片：名称、简介、作者、版本、分类、标签、兼容性、风险等级、更新时间。
- 搜索：名称、描述、标签、作者、Unreal API、控件 `Aka`、文档标题。
- 筛选：分类、UE 版本、TAPython 版本、风险等级、作者、审核状态。
- 操作：查看详情、下载最新版本、查看历史版本。

### 工具详情 `/tools/<tool>`

- 首屏：工具名、用途、版本、作者、兼容性、风险等级、下载按钮。
- 安装区：手动安装步骤、Agent 安装指令、MenuConfig 片段。
- 文档区：完整 Markdown 渲染。
- 下载区：ZIP、manifest、README、历史版本。
- 版本区：当前版本、上一版本、对比入口。

### 版本页 `/tools/<tool>/versions`

- 展示版本列表、发布时间、作者、变更摘要。
- 每个版本提供 ZIP、manifest 和 compare 入口。
- 标记 deprecated、archived 或 breaking change。

### 对比页 `/compare`

- 支持选择工具、from 版本、to 版本。
- MVP 展示 manifest diff、包级 diff、Git 平台 diff 链接。
- V1 展示 Markdown 结构 diff、代码块语义 diff。

### 投稿页 `/submit`

- MVP 展示投稿规范、模板、审核清单。
- V1 支持上传 Markdown、ZIP、截图、版本说明。
- V2 支持审核工作流和权限管理。

## 搜索方案

MVP 使用前端本地搜索，不依赖后端。

推荐技术：`MiniSearch` 或 `Fuse.js`。

搜索索引字段：

- `name`
- `displayName`
- `description`
- `category`
- `tags`
- `author`
- `compatibility`
- `riskLevel`
- `unrealApis`
- `widgetAkas`
- `headings`

排序规则：

1. 名称精确匹配优先。
2. 标签和分类匹配优先。
3. 描述和标题匹配其次。
4. 与当前项目 UE/TAPython 版本兼容的工具优先。
5. 已审核且非 deprecated 的工具优先。

工具数量上千后，再切换到 `Meilisearch`、`Typesense` 或数据库全文搜索。

## 上传与发布流程

### MVP：维护者发布

1. 工具作者按模板准备工具文档和 ZIP。
2. 工具作者提交到仓库或内网共享目录。
3. 维护者检查文档、manifest、ZIP 结构和风险说明。
4. 构建脚本生成工具索引、manifest 快照、下载包和站点页面。
5. 部署到内网或云端静态站点。

### V1：网页上传

1. 作者登录站点。
2. 上传 Markdown、ZIP、截图和版本说明。
3. 后端解析 manifest，生成校验报告。
4. 审核者查看预览、diff 和风险项。
5. 审核通过后发布到工具库。

审核状态：

- `draft`
- `pending`
- `approved`
- `rejected`
- `deprecated`
- `archived`

## 下载与安装流程

### 手动安装

1. 用户下载工具 ZIP。
2. 解压到 `<Project>/TA/TAPython/Python/<ToolName>/`。
3. 将 `MenuConfig.snippet.json` 合并到 `<Project>/TA/TAPython/UI/MenuConfig.json`。
4. Reload TAPython 或重启 UE 编辑器。
5. 在指定菜单挂载点确认工具入口。

### Agent 安装

1. Agent 读取 `/api/tools/index.json`。
2. 根据工具名读取 `/api/tools/<tool>.json`。
3. 下载 manifest 和 ZIP。
4. 校验 ZIP 和文件 hash。
5. 展示安装预览：将写入的文件、目标路径、MenuConfig diff。
6. 用户确认后复制工具文件。
7. Agent 合并 MenuConfig。
8. Agent 提示用户 Reload TAPython 或重启 UE。

站点本身不直接写用户项目目录。写入动作由本地 Agent、内部安装器或用户手动完成。

## 版本对比方案

不建议只依赖 GitHub/GitLab compare。普通用户需要更清楚地知道“升级会影响什么”。

| 方案 | 成本 | 适用阶段 | 说明 |
|------|------|----------|------|
| Git diff / GitLab compare / GitHub compare | 低 | MVP | 适合技术审核，保留完整源码历史 |
| Manifest diff | 低 | MVP | 对比版本号、兼容性、依赖、文件、hash、安装路径、MenuConfig |
| ZIP 包级 diff | 低 | MVP | 对比新增、删除、修改文件，适合安装器升级判断 |
| Markdown 结构 diff | 中 | V1 | 对比章节、快速开始、风险提示、版本历史和代码块 hash |
| 代码块语义 diff | 中高 | V1/V2 | 对比 MenuConfig、UI JSON、Python 方法、Unreal API 调用 |
| 数据库版本快照 diff | 中高 | V2 | 每次发布入库，可快速站内对比任意版本 |
| UI 可视化 diff | 高 | V2+ | 渲染 Chameleon UI 结构树或截图，直观看 UI 变化 |

推荐组合：

- MVP：Manifest diff + ZIP 包级 diff + Git 平台链接。
- V1：增加 Markdown 结构 diff 和代码块语义 diff。
- V2：增加数据库版本快照和 UI 可视化 diff。

## 技术选型

### MVP 推荐栈

- 前端：`Vite + React + TypeScript`。
- UI：`Ant Design`。
- 构建：`Node.js` 脚本。
- Markdown：`gray-matter`、`remark/rehype`。
- 代码高亮：`shiki` 或 `highlight.js`。
- 搜索：`MiniSearch` 或 `Fuse.js`。
- 制品：ZIP + manifest + JSON 索引。
- 部署：`nginx` 静态托管。

选择 `Ant Design` 的原因：Tool Hub 更像公司内部资产管理/工具管理平台，需要表格、筛选、上传、状态、审核和管理视图，Ant Design 成本最低。

### 后端演进栈

当需要在线上传、审核、权限和下载统计时，引入后端：

- 后端：`FastAPI`。
- 数据库：小团队内网使用 `SQLite`，多人协作使用 `PostgreSQL`。
- 文件存储：内网磁盘/NAS/MinIO，云端 OSS/COS/S3/R2。
- 认证：公司 SSO、LDAP、OAuth 或内网账号。

## 部署方案

### 公司局域网

适用场景：工具包含公司内部流程、项目路径或专有代码。

MVP 部署：

```text
内网 Git/共享目录
    ↓ 构建脚本
静态前端 + JSON + ZIP + manifest
    ↓
nginx / IIS / NAS HTTP 服务
    ↓
浏览器 / Agent / 内部安装器
```

优点：

- 权限边界清楚。
- 下载速度快。
- 可访问内部 Git 和制品库。
- 部署维护成本低。

注意事项：

- 使用稳定内网域名，不建议长期使用机器 IP。
- 站点、ZIP、manifest、版本快照需要备份。
- Agent 和用户机器必须能访问同一内网地址。

### 在线云服务器

适用场景：跨地区协作、远程办公、多团队访问或外部顾问访问。

静态云部署：

- 前端和 JSON 放对象存储/CDN。
- ZIP 放对象存储。
- 上传仍由维护者流程完成。

动态云部署：

- 前端 + API 服务 + 数据库 + 对象存储。
- 支持账号、权限、上传、审核、下载统计和版本快照。

权限策略：

- 公开工具可匿名下载。
- 内部工具应使用登录、VPN、IP 白名单或签名 URL。
- 如果 ZIP 包含公司内部代码，需要日志审计和下载权限控制。

## 实施目录

本方案对应的新实施目录：

```text
tapython-tool-hub/
├── README.md
├── README_CN.md
├── package.json
├── data/
│   ├── tools/
│   └── tool-docs/
├── docs/
├── public/
├── scripts/
└── src/
```

目录职责：

- `src/`：前端应用代码。
- `scripts/`：工具数据扫描、manifest 生成、下载制品生成、版本快照和 diff 脚本。
- `data/tool-docs/`：当前静态维护阶段的 Markdown-first 工具文档和引用资源。
- `data/tools/`：兼容旧 JSON 数据源。
- `public/`：静态资源。
- `docs/`：实施过程中的技术文档和接口说明。

## 分阶段实施

### Phase 0：需求确认

- 确认第一期优先部署在公司局域网还是云端。
- 确认第一期是否需要登录。
- 确认第一期是否需要网页上传。
- 确认工具包是否允许公开访问。

### Phase 1：静态 MVP

- 搭建 `Vite + React + TypeScript + Ant Design` 工程。
- 准备工具数据模型和样例数据。
- 实现工具目录、详情页、搜索、下载入口。
- 实现 manifest 展示和基础版本对比。
- 使用 nginx 或本地静态服务器预览。

### Phase 2：发布链路

- 实现工具文档校验。
- 实现 ZIP 结构校验。
- 实现 manifest 生成。
- 实现下载包 hash 计算。
- 实现版本快照归档。

### Phase 3：Agent 安装链路

- 输出 `/api/tools/index.json`。
- 输出 `/api/tools/<tool>.json`。
- 定义 Agent 安装提示词和安装预览格式。
- 支持 MenuConfig 合并 diff 展示。

### Phase 4：后台能力

- 增加上传表单。
- 增加审核状态。
- 增加用户和权限。
- 增加下载统计。
- 引入数据库和对象存储。

### Phase 5：高级对比与安装器

- Markdown 结构 diff。
- 代码块语义 diff。
- UI 结构 diff。
- 内网安装器或 UE 内安装工具。

## 验证清单

1. 使用 `ActorRenameTool.md` 制作一条工具数据，确认能填完整 manifest 字段。
2. 准备两个版本的 manifest，验证 Manifest diff 能展示版本号、兼容性、文件 hash、MenuConfig、风险等级变化。
3. 准备一个工具 ZIP，确认解压后能复制到 `<Project>/TA/TAPython/Python/<ToolName>/`。
4. 模拟 Agent 安装，确认能读取工具 JSON、下载 ZIP、校验 hash、展示 MenuConfig 合并预览。
5. 在内网静态服务中访问站点，确认网页、JSON、ZIP 都能被浏览器和 Agent 访问。
6. 若选择云部署，验证匿名、登录、IP 白名单或签名 URL 中至少一种权限方案。

## 当前决策

- 本站点是独立 Tool Hub，不基于当前已有 `site/` 实现。
- 核心资产是可安装工具包，不是 Skill。
- MVP 优先支持局域网静态部署。
- 第一阶段不强制实现网页上传和登录。
- 版本对比优先提供 Manifest diff 和 ZIP 包级 diff。
- Agent 安装必须先展示写入文件和 MenuConfig 合并预览。
