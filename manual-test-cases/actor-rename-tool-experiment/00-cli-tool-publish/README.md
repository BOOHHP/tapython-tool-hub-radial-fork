# 0. CLI 工具发布实验

## 目标

验证 `tapython-tool-hub` CLI 在发布给用户前是否满足基本要求：可以构建、可以通过测试、可以输出版本与帮助信息，并且本地 API 可访问。

本步骤中的“CLI 工具发布”指发布 Tool Hub 的命令行工具本身，不是把 Actor Rename Tool 发布到工具库。Actor Rename Tool 在这里作为 CLI 后续安装测试的真实数据对象。

## 本地数据确认

本次检查发现 Actor Rename Tool 已经存在完整本地数据，因此不需要新建工具。

源数据归档在：`source-data/`

| 文件 | 说明 |
| --- | --- |
| `actor-rename-tool.md` | Markdown front matter 和工具说明，是发布主数据。 |
| `ActorRenameTool.json` | Chameleon UI 定义。 |
| `ActorRenameTool.py` | Python Controller。 |
| `__init__.py` | Python 包初始化文件。 |
| `MenuConfig.snippet.json` | 菜单挂载片段。 |

生成产物归档在：`generated-data/`

| 文件 | 说明 |
| --- | --- |
| `manifest.json` | 安装 manifest，包含路径、文件 hash、MenuConfig 合并项。 |
| `README.md` | 面向安装用户的 README。 |
| `tool.md` | 导出的工具 Markdown。 |
| `actor-rename-tool-1.2.0.zip` | 完整 ZIP 包。 |
| `MenuConfig.snippet.json` | 导出的菜单片段。 |
| `ActorRenameTool/` | ZIP 解包等价资源目录。 |

如果本地没有数据，应先在 `data/tool-docs/<slug>/` 下新增 Markdown、UI JSON、Python Controller、`__init__.py` 和 MenuConfig 片段，再执行 `npm run generate:data` 生成 manifest、README、tool.md 和 ZIP。

## 执行命令

```bash
npm run build-cli
npm test -w @tapython-tool-hub/cli
node packages/cli/dist/index.js --version
node packages/cli/dist/index.js --help
node packages/cli/dist/index.js hub ping --hub http://127.0.0.1:8787
```

## 过程文件

| 文件 | 内容 |
| --- | --- |
| `command-logs/01-build-cli.txt` | CLI 构建输出。 |
| `command-logs/02-test-cli.txt` | CLI 测试输出。 |
| `command-logs/03-cli-version.txt` | 构建后 CLI 版本。 |
| `command-logs/04-cli-help.txt` | CLI 帮助文本。 |
| `command-logs/05-hub-ping.txt` | 本地 API 连通性验证。 |
| `command-logs/06-source-files.txt` | 本步骤源文件清单。 |
| `command-logs/07-generated-files.txt` | 本步骤生成产物清单。 |

## 实验结果

- `npm run build-cli` 成功。
- `npm test -w @tapython-tool-hub/cli` 成功。
- CLI 测试结果：23 个测试全部通过。
- `node packages/cli/dist/index.js --version` 输出 `tapython-tool-hub 0.1.0`。
- `hub ping` 返回 `Hub at http://127.0.0.1:8787 is reachable. Status: ok`。

## 发布要求

1. 发布 CLI 前必须完成构建和测试。
2. CLI 安装脚本只能安装 `tapython-tool-hub` 命令，不能修改 Unreal Engine 项目目录。
3. 发布说明必须包含 macOS/Linux 和 Windows PowerShell 安装命令。
4. 用户安装 CLI 后，应先运行 `tapython-tool-hub --version` 和 `tapython-tool-hub hub ping --hub <url>`。
