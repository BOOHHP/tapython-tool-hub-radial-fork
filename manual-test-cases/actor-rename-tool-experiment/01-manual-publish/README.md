# 1. 手动发布实验

## 目标

明确 Actor Rename Tool 作为一个可发布工具时，本地到底需要哪些文件、生成哪些产物，以及人类用户通过站点发布时应如何操作。

本步骤没有再次提交新版本，因为当前工具已经是 `approved` 状态，版本 `1.2.0` 已发布。文档记录真实发布所需材料和人工发布流程，避免重复发布同 slug 同版本触发“已发布版本不可变”。

## 本地工具文件清单

源文件归档在：`source-tool-files/`

| 文件 | 发布角色 | 要求 |
| --- | --- | --- |
| `actor-rename-tool.md` | 主发布文档 | 必须包含 front matter、安装路径、版本、风险、MenuConfig 和外部文件引用。 |
| `ActorRenameTool.json` | UI 资源 | 被 Markdown 中 `@file` 引用，必须是合法 JSON。 |
| `ActorRenameTool.py` | Controller 资源 | 被 Markdown 中 `@file` 引用，必须能被 TAPython 加载。 |
| `__init__.py` | Python 初始化 | 随工具目录一起发布。 |
| `MenuConfig.snippet.json` | 菜单片段 | 必须能结构化合并进 `OnToolBarChameleon`。 |

生成产物归档在：`generated-release-files/`

| 文件 | 作用 |
| --- | --- |
| `manifest.json` | CLI、AI Agent、人工安装共同依赖的安装契约。 |
| `README.md` | ZIP 内离线说明。 |
| `tool.md` | 对外可下载工具说明。 |
| `actor-rename-tool-1.2.0.zip` | 手动 ZIP 安装完整包。 |
| `MenuConfig.snippet.json` | 导出的菜单片段。 |
| `ActorRenameTool/` | 工具核心资源。 |

## 人工发布流程

1. 打开 `http://localhost:5174/`。
2. 点击顶部“投稿”。
3. 在“提交工具或新版本”中填写：
   - Slug：`actor-rename-tool`。
   - 提交人：工具维护者或团队名。
   - 工具 Markdown：粘贴 `actor-rename-tool.md` 的完整内容。
   - 投稿备注：说明版本变化、风险和兼容性。
4. 上传 Markdown 中 `@file` 引用的资源：`ActorRenameTool.json`、`ActorRenameTool.py`、`__init__.py`、`MenuConfig.snippet.json`。
5. 点击“提交并校验”。
6. 检查校验报告，确认没有缺字段、hash、路径或 MenuConfig 错误。
7. 审核人在审核队列中点击“通过并发布”。
8. 回到工具库，搜索 `actor-rename-tool`，确认详情页版本、下载、安装方式和 Manifest 正确。

## 本次实验保存的数据

| 文件 | 内容 |
| --- | --- |
| `operation-data/source-file-list.txt` | 源文件清单。 |
| `operation-data/generated-release-file-list.txt` | 生成产物清单。 |
| `operation-data/package-sha256.txt` | ZIP 包 sha256。 |

## 本次发布包校验值

```text
e5d531e07a00b5b6b1ed74fdbffd675d9998090aa8b2f1747d91db543648feb8
```

## 验收要求

1. 同 slug 同版本已发布时，系统必须阻止再次发布。
2. 发布后必须导出 `manifest.json`、`README.md`、`tool.md` 和 ZIP。
3. ZIP sha256 必须能和页面/API 展示值一致。
4. 详情页“安装方式”中应能看到 AI 提示词、CLI 命令和 ZIP 下载入口。
