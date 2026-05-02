# 2. CLI 安装实验

## 目标

指定一个临时目录，使用构建后的本地 CLI 对 Actor Rename Tool 进行完整安装演示，并保存每一步命令输出和最终安装结果。

## 临时项目

临时项目目录：`tmp-project/`

初始 TAPython 结构：

```text
tmp-project/TA/TAPython/Python/
tmp-project/TA/TAPython/UI/MenuConfig.json
```

初始 `MenuConfig.json`：

```json
{
  "OnToolBarChameleon": []
}
```

## 执行流程

1. 搜索工具：

```bash
node packages/cli/dist/index.js search actor --hub http://127.0.0.1:8787
```

2. 查看工具详情：

```bash
node packages/cli/dist/index.js show actor-rename-tool --hub http://127.0.0.1:8787
```

3. 生成人类可读安装计划：

```bash
node packages/cli/dist/index.js plan actor-rename-tool --hub http://127.0.0.1:8787 --project manual-test-cases/actor-rename-tool-experiment/02-cli-install/tmp-project
```

4. 生成 JSON 安装计划：

```bash
node packages/cli/dist/index.js plan actor-rename-tool --hub http://127.0.0.1:8787 --project manual-test-cases/actor-rename-tool-experiment/02-cli-install/tmp-project --json
```

5. 下载 manifest 和 ZIP：

```bash
node packages/cli/dist/index.js download actor-rename-tool --hub http://127.0.0.1:8787 --output manual-test-cases/actor-rename-tool-experiment/02-cli-install/downloads
```

6. 执行 dry-run：

```bash
node packages/cli/dist/index.js install actor-rename-tool --hub http://127.0.0.1:8787 --project manual-test-cases/actor-rename-tool-experiment/02-cli-install/tmp-project --dry-run
```

7. 确认后实际安装：

```bash
node packages/cli/dist/index.js install actor-rename-tool --hub http://127.0.0.1:8787 --project manual-test-cases/actor-rename-tool-experiment/02-cli-install/tmp-project --yes
```

## 过程文件

| 文件 | 内容 |
| --- | --- |
| `command-logs/01-search.txt` | 搜索结果。 |
| `command-logs/02-show.txt` | 工具详情。 |
| `command-logs/03-plan.txt` | 人类可读安装计划。 |
| `command-logs/04-plan.json` | JSON 安装计划。 |
| `command-logs/05-download.txt` | 下载结果。 |
| `command-logs/06-dry-run.txt` | dry-run 输出。 |
| `command-logs/07-install.txt` | 实际安装输出。 |
| `command-logs/08-final-files.txt` | 安装后的文件清单。 |
| `downloads/manifest.json` | CLI 下载的 manifest。 |
| `downloads/actor-rename-tool-1.2.0.zip` | CLI 下载的 ZIP。 |
| `final-snapshot/` | CLI 安装完成后的项目快照。 |

## 安装结果

CLI 安装成功，关键结果如下：

- TAPython 目录检查通过。
- ZIP 包级 hash 校验通过。
- `MenuConfig.json` 可写。
- 写入 4 个工具文件。
- 添加 1 个 MenuConfig 菜单项。
- 生成安装账本：`tmp-project/TA/TAPython/.tool-hub/installed.json`。
- 生成 MenuConfig 备份：`tmp-project/TA/TAPython/UI/MenuConfig.json.bak.*`。

最终文件包括：

```text
tmp-project/TA/TAPython/.tool-hub/installed.json
tmp-project/TA/TAPython/Python/ActorRenameTool/ActorRenameTool/ActorRenameTool.json
tmp-project/TA/TAPython/Python/ActorRenameTool/ActorRenameTool/ActorRenameTool.py
tmp-project/TA/TAPython/Python/ActorRenameTool/ActorRenameTool/__init__.py
tmp-project/TA/TAPython/Python/ActorRenameTool/MenuConfig.snippet.json
tmp-project/TA/TAPython/UI/MenuConfig.json
tmp-project/TA/TAPython/UI/MenuConfig.json.bak.*
```

最终 `MenuConfig.json` 已包含：

```json
{
  "name": "Actor Rename Tool",
  "ChameleonTools": "../Python/ActorRenameTool/ActorRenameTool.json",
  "ExtensionHookName": "OnToolBarChameleon"
}
```

## 人工验收

1. 检查 `command-logs/07-install.txt` 中是否出现 `Installed Actor Rename Tool 1.2.0`。
2. 检查 `tmp-project/TA/TAPython/Python/ActorRenameTool/` 是否存在工具文件。
3. 检查 `tmp-project/TA/TAPython/UI/MenuConfig.json` 是否添加菜单项。
4. 检查 `.tool-hub/installed.json` 是否记录 slug、版本、文件 hash 和备份路径。
