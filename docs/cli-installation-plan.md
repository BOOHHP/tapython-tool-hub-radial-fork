# Tool Hub CLI 与安装方式优化计划

## 背景理解

SkillHub 的 `summarize` 技能安装方式给 Tool Hub 提供了一个清晰参照：安装入口不只是一枚下载按钮，而是同时服务普通用户、终端用户和 AI 助手。

从 `https://www.skillhub.cn/skills/summarize` 和 `https://skillhub.cn/install/skillhub.md` 可归纳为三种安装路径：

1. 复制提示词给任意 AI 助手。提示词要求助手先检查是否已安装 SkillHub 商店或 CLI；若未安装，只安装 CLI，再执行 `skillhub install summarize`；若已安装，直接安装 `summarize` 技能。适用对象包括 Lighthouse OpenClaw、WorkBuddy、QClaw、Kimi、Claude 等。
2. 在终端安装 CLI 后安装技能。CLI-only 安装命令为：

```bash
curl -fsSL https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com/install/install.sh | bash -s -- --cli-only
skillhub install summarize
```

3. 通过 ZIP 包离线安装。ZIP 适合不能运行安装脚本、内网镜像、审计归档或手动解包的场景。

Tool Hub 仍然分享 TAPython/Chameleon 编辑器工具，不转向分享 Skill；但安装体验应学习 SkillHub 的分层入口：网页可读、终端可执行、Agent 可自动操作、ZIP 可离线兜底。

## 目标

1. 优化当前下载方式，让用户明确知道自己下载的是 ZIP、manifest、README 还是 Markdown。
2. 设计 `tapython-tool-hub` CLI，使 Copilot、Claude、Kimi、OpenClaw 等 AI 助手能通过站点 API 直接完成查询、安装预览、下载、校验和本地写入。
3. 在网页详情页提供“复制给 AI 助手的安装提示词”，让用户无需理解 API 细节也能让助手完成安装。
4. 保留 ZIP 包安装作为离线和低信任环境的稳定入口。

## 对外安装入口

### 方式一：复制提示词给 AI 助手

每个工具详情页提供“复制 AI 安装提示词”。提示词模板如下：

```text
请帮我从 TAPython Tool Hub 安装工具：<tool-slug>。

1. 先检查本机是否可用 tapython-tool-hub CLI：执行 tapython-tool-hub --version。
2. 如果未安装 CLI，请根据当前操作系统安装 Tool Hub CLI；只安装 CLI，不修改 UE 项目。
3. 安装或确认 CLI 后，读取工具 API：<hub-base-url>/api/tools/<tool-slug>.json。
4. 下载 manifest 和 ZIP 包，校验 hash。
5. 先执行 dry-run，展示目标项目路径、将写入的文件、已有文件冲突、MenuConfig.json 合并 diff 和回滚方案。
6. 等我确认后再执行实际安装。

推荐命令：
tapython-tool-hub install <tool-slug> --hub <hub-base-url> --project "<Project>" --dry-run
```

如果未来提供一键安装脚本，提示词也必须要求 AI 助手优先执行 CLI-only 安装，避免安装脚本直接写入项目目录。

### 方式二：终端 CLI 安装

详情页展示两步命令：先安装 CLI，再安装工具。

```bash
# 示例占位，实际 URL 待发布 CLI 后替换为内网或公网地址
curl -fsSL https://<tool-hub-domain>/install/cli.sh | bash -s -- --cli-only
tapython-tool-hub install actor-rename-tool --hub https://<tool-hub-domain> --project "<Project>"
```

CLI 默认先展示安装计划并要求确认；AI 助手或 CI 场景可使用 `--dry-run` 获取预览，或在人工确认后使用 `--yes` 执行。

### 方式三：ZIP 包安装

ZIP 包作为稳定离线入口，必须包含：

- `manifest.json`
- `README.md`
- `tool.md`
- `MenuConfig.snippet.json`
- Chameleon UI JSON
- Python Controller
- `__init__.py`

ZIP 下载页应同步展示包级 sha256、版本号、发布日期和文件清单。用户手动解压后仍应按 manifest 的 `installPath` 和 `menuConfigMerge` 操作。

## CLI 设计

### 命令范围

```bash
tapython-tool-hub --version
tapython-tool-hub hub ping --hub https://<tool-hub-domain>
tapython-tool-hub search actor --hub https://<tool-hub-domain>
tapython-tool-hub show actor-rename-tool --hub https://<tool-hub-domain>
tapython-tool-hub plan actor-rename-tool --hub https://<tool-hub-domain> --project "<Project>"
tapython-tool-hub install actor-rename-tool --hub https://<tool-hub-domain> --project "<Project>"
tapython-tool-hub install https://<tool-hub-domain>/downloads/actor-rename-tool/1.2.0/manifest.json --project "<Project>"
tapython-tool-hub verify --manifest ./manifest.json --package ./actor-rename-tool-1.2.0.zip
tapython-tool-hub download actor-rename-tool --hub https://<tool-hub-domain> --version 1.2.0 --output ./downloads
tapython-tool-hub uninstall actor-rename-tool --project "<Project>"
```

### Agent 友好输出

所有核心命令支持 `--json`，便于 Copilot 等助手解析。

```bash
tapython-tool-hub plan actor-rename-tool --hub https://<tool-hub-domain> --project "<Project>" --json
```

JSON 输出至少包含：

- `tool`：slug、displayName、version。
- `downloads`：manifest、package、readme、markdown URL。
- `checks`：hash 校验、路径检查、TAPython 目录检查、MenuConfig 可写检查。
- `filePlan`：新增、覆盖、跳过、备份路径。
- `menuConfigDiff`：将添加或移除的菜单项。
- `warnings`：风险提示、版本不兼容、已有文件冲突。
- `nextCommand`：用户确认后可执行的命令。

### 默认安全策略

1. 默认不写入项目目录，先生成安装计划。
2. 实际写入前必须确认，除非显式传入 `--yes`。
3. 只允许写入 manifest 声明的 `installPath` 和 `menuConfigMerge.target`。
4. 写入前校验 ZIP 包和每个文件的 sha256。
5. 覆盖前生成备份，记录 uninstall/rollback 清单。
6. `MenuConfig.json` 使用 JSON 解析和结构化合并，不做字符串拼接。
7. 下载 URL 默认只允许同一个 Tool Hub 域名，跨域下载需要显式 `--allow-remote-package`。

## 站点与 API 调整

### 前端

1. 详情页下载按钮区改成明确的四个入口：AI 安装提示词、CLI 安装、ZIP 完整包、manifest/Markdown。
2. 当前主按钮文案如果没有 ZIP，不应继续显示“下载 ZIP”，应根据实际 fallback 显示“打开 README”或“打开 Markdown”。
3. ZIP 入口展示包大小、sha256 和版本号。
4. CLI 入口提供可复制命令，并允许用户选择 hub 地址、版本和项目路径占位符。

### API

保持现有兼容路径：

```text
/api/tools/index.json
/api/tools/<tool>.json
/downloads/<tool>/<version>/manifest.json
/downloads/<tool>/<version>/<tool>-<version>.zip
```

建议新增 Agent/CLI 友好端点：

```text
/api/tools/<tool>/install-prompt
/api/tools/<tool>/versions/<version>/install-plan-template
/api/tools/<tool>/versions/<version>/package.sha256
```

其中 install-plan-template 不需要知道用户本地项目路径，只返回 manifest、下载地址、风险提示和 CLI 参数模板。本地路径检查仍由 CLI 完成。

### 生成器

1. ZIP 必须可重复生成，文件顺序、时间戳和编码稳定。
2. 生成 ZIP 后计算包级 sha256，并写回 tool detail 的 downloads 元数据。
3. 如果缺少任一 manifest 文件，生成器应明确标记 `packageAvailable: false` 和原因，而不是只清空 package URL。
4. README、tool.md 和 manifest 应始终进入 ZIP，便于离线审计。

## 实施阶段

### Phase 1：文档与网页文案

1. 在工具详情页加入 AI 安装提示词模板。
2. 修正下载按钮 fallback 文案，避免无 ZIP 时仍显示“下载 ZIP”。
3. 在 README 和工具详情页说明三种安装方式。

验收：用户能从详情页清楚选择 AI、CLI 或 ZIP 安装路径。

### Phase 2：ZIP 元数据完善

1. 生成包级 sha256 和 size。
2. 将 package sha256/size 暴露到 `/api/tools/<tool>.json`。
3. 前端展示 ZIP 校验信息。

验收：手动下载 ZIP 后可对照页面或 API 校验 sha256。

### Phase 3：CLI MVP

1. 新增 `packages/cli` 或 `apps/cli`。
2. 实现 `search`、`show`、`plan`、`download`、`verify`、`install --dry-run`。
3. `install` 首版只支持 manifest + ZIP 的本地安装，不处理复杂升级。
4. 输出同时支持人类可读格式和 `--json`。

验收：Copilot 等助手可通过 CLI 读取 Tool Hub、生成 dry-run 安装计划，并在用户确认后完成工具文件写入。

### Phase 4：安装、升级与回滚

1. 实现结构化 MenuConfig 合并。
2. 实现备份、uninstall 和 rollback。
3. 实现同工具旧版本检测和升级 diff。
4. 增加 CLI 单元测试与临时目录集成测试。

验收：CLI 能安装、升级、卸载一个样例工具，并能在测试中验证 hash、文件写入和 MenuConfig diff。

### Phase 5：CLI 分发

1. 提供内网 CLI-only 安装脚本。
2. 安装脚本只安装 `tapython-tool-hub` 命令，不自动写 UE 项目。
3. 支持 macOS、Windows 和 Linux 的安装说明。
4. 在详情页自动生成对应平台命令。

验收：用户复制终端命令即可安装 CLI，再通过 `tapython-tool-hub install <tool>` 安装工具。

## 优先级建议

短期先做 Phase 1 和 Phase 2，因为它们能立即修正当前下载体验，并为 Agent 安装提供更明确上下文。随后再做 CLI MVP，让站点真正从“可下载”升级为“可被 AI 助手可靠操作”。
