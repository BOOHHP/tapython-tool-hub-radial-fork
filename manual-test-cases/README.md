# TAPython Tool Hub 人工测试用例

本目录用于指导人类用户在本地或内网环境验证 TAPython Tool Hub 的发布与安装体验。文档分成两个目标：

1. 人类用户操作手册：按真实用户路径说明如何发布、安装和验收工具。
2. 网站或工具优化建议：记录测试过程中发现的 UI 交互复杂点，并给出整改方向。

## 当前测试环境

- 测试日期：2026-05-02
- Web：`http://localhost:5174/`
- API：`http://127.0.0.1:8787`
- 推荐浏览器：Chrome 或 Edge
- 推荐终端：macOS Terminal、Windows PowerShell、VS Code Terminal

## 文档索引

- [human-user-operation-manual.md](human-user-operation-manual.md)：面向人类用户的完整操作手册。
- [release-and-install-test-cases.md](release-and-install-test-cases.md)：四类核心测试用例与验收要求。
- [ui-tool-optimization-suggestions.md](ui-tool-optimization-suggestions.md)：站点 UI 和 CLI 工具简化建议。
- [actor-rename-tool-experiment/README.md](actor-rename-tool-experiment/README.md)：使用站点中的 Actor Rename Tool 执行 0-3 全流程实验。

## 四类必测场景

| 编号 | 场景 | 目标 |
| --- | --- | --- |
| 0 | CLI 工具发布 | 验证 `tapython-tool-hub` CLI 可构建、测试、通过安装脚本分发，并且脚本只安装 CLI。 |
| 1 | 手动发布 | 验证人类用户通过网页投稿、校验、审核发布工具版本。 |
| 2 | CLI 安装 | 验证用户通过终端命令完成搜索、预览、下载、校验和安装。 |
| 3 | 手动 ZIP 安装 | 验证用户离线下载 ZIP、校验 sha256、解压并手动合并 MenuConfig。 |

## 通用验收要求

- 每个流程都必须先展示风险、目标路径、版本号和校验信息，再进入写入或发布动作。
- 任何写入项目目录的动作都必须可预览、可取消，并能说明回滚方式。
- 已发布版本不可变；同 slug 同版本重复发布必须被阻止。
- ZIP 包必须包含 `manifest.json`、`README.md`、`tool.md`、工具 JSON、Python Controller 和 `MenuConfig.snippet.json`。
- CLI-only 安装脚本不得修改 Unreal Engine 项目目录。
