# Actor Rename Tool 操作实验系列

本目录把站点中的 `Actor Rename Tool` 作为实际案例，完整记录发布与安装的人工实验。每个步骤都有独立文件夹，保存过程日志、源数据、下载包、临时项目和最终结果快照。

## 实验对象

- 工具 slug：`actor-rename-tool`
- 工具名：`Actor Rename Tool`
- 版本：`1.2.0`
- 作者：`WeiXuLu`
- 风险等级：`medium`
- 安装路径：`<Project>/TA/TAPython/Python/ActorRenameTool/`
- MenuConfig 目标：`<Project>/TA/TAPython/UI/MenuConfig.json`
- 本地 Web：`http://localhost:5174/`
- 本地 API：`http://127.0.0.1:8787`

## 步骤目录

| 编号 | 目录 | 目标 | 本次结果 |
| --- | --- | --- | --- |
| 0 | `00-cli-tool-publish/` | 验证 CLI 工具发布前的构建、测试和分发入口 | CLI 构建成功，CLI 测试 23/23 通过 |
| 1 | `01-manual-publish/` | 明确手动发布所需本地工具文件和生成产物 | 源文件、manifest、README、tool.md、ZIP 已归档 |
| 2 | `02-cli-install/` | 用临时目录演示 CLI 安装流程和结果 | 已安装到临时 TAPython 项目并生成账本 |
| 3 | `03-manual-zip-install/` | 用临时目录演示手动 ZIP 安装流程和结果 | ZIP sha256 通过，文件复制和 MenuConfig 合并完成 |

## 实验目录约定

- `source-data/` 或 `source-tool-files/`：本地维护源文件。
- `generated-data/` 或 `generated-release-files/`：站点生成的发布产物。
- `command-logs/`：命令行执行结果。
- `tmp-project/`：安装实验使用的临时 TAPython 项目。
- `final-snapshot/`：安装完成后的最终状态快照。

## 关键结论

1. 本地已经存在 Actor Rename Tool 的完整源数据，因此 0/1 步没有新建工具，而是使用现有真实工具作为发布样例。
2. CLI 发布验证通过，`npm run build-cli` 和 `npm test -w @tapython-tool-hub/cli` 均成功。
3. CLI 安装实验会额外生成 `.tool-hub/installed.json` 和 `MenuConfig.json.bak.*`，这是自动安装相对手动 ZIP 安装的主要差异。
4. 手动 ZIP 安装需要人工负责 sha256 校验、文件复制和 MenuConfig 合并；本实验已经保存了校验结果与最终文件清单。
