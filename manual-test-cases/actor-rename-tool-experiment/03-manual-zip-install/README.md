# 3. 手动 ZIP 安装实验

## 目标

指定一个临时目录，不使用 CLI，完全按照人工方式完成 Actor Rename Tool 的 ZIP 下载、sha256 校验、解压、文件复制、MenuConfig 合并和最终结果确认。

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

## ZIP 准备

从站点发布产物复制到：`zip-package/`

| 文件 | 内容 |
| --- | --- |
| `actor-rename-tool-1.2.0.zip` | 手动安装完整包。 |
| `manifest.json` | 安装契约对照文件。 |
| `sha256-local.txt` | 本地 ZIP sha256。 |
| `zip-file-list.txt` | ZIP 内文件清单。 |
| `unzip-log.txt` | 解压日志。 |

本次 ZIP sha256：

```text
e5d531e07a00b5b6b1ed74fdbffd675d9998090aa8b2f1747d91db543648feb8
```

## 执行流程

1. 校验 ZIP：

```bash
shasum -a 256 zip-package/actor-rename-tool-1.2.0.zip
```

2. 查看 ZIP 内容：

```bash
unzip -l zip-package/actor-rename-tool-1.2.0.zip
```

3. 解压 ZIP：

```bash
unzip -o zip-package/actor-rename-tool-1.2.0.zip -d extracted
```

4. 读取 `extracted/manifest.json`，确认：
   - `installPath` 是 `<Project>/TA/TAPython/Python/ActorRenameTool/`。
   - `files` 包含 4 个待安装文件。
   - `menuConfigMerge.target` 是 `<Project>/TA/TAPython/UI/MenuConfig.json`。
   - `itemsToAdd` 包含 `Actor Rename Tool` 菜单项。
5. 复制工具文件到临时项目：

```bash
mkdir -p tmp-project/TA/TAPython/Python/ActorRenameTool
cp -R extracted/ActorRenameTool tmp-project/TA/TAPython/Python/ActorRenameTool/
cp extracted/MenuConfig.snippet.json tmp-project/TA/TAPython/Python/ActorRenameTool/
```

6. 手动合并 `MenuConfig.json`，添加以下条目：

```json
{
  "name": "Actor Rename Tool",
  "ChameleonTools": "../Python/ActorRenameTool/ActorRenameTool.json",
  "ExtensionHookName": "OnToolBarChameleon"
}
```

7. 校验 `MenuConfig.json` 是合法 JSON。
8. 保存最终项目快照到 `final-snapshot/`。

## 过程文件

| 文件 | 内容 |
| --- | --- |
| `zip-package/after-copy-files.txt` | 文件复制后的项目文件清单。 |
| `zip-package/installed-file-sha256.txt` | 已复制工具文件的 sha256。 |
| `zip-package/final-files.txt` | 最终项目文件清单。 |
| `zip-package/menuconfig-validation.txt` | MenuConfig JSON 校验结果。 |
| `extracted/` | ZIP 解压后的原始内容。 |
| `tmp-project/` | 手动安装后的临时项目。 |
| `final-snapshot/` | 最终项目快照。 |

## 安装结果

手动 ZIP 安装成功，最终文件包括：

```text
tmp-project/TA/TAPython/Python/ActorRenameTool/ActorRenameTool/ActorRenameTool.json
tmp-project/TA/TAPython/Python/ActorRenameTool/ActorRenameTool/ActorRenameTool.py
tmp-project/TA/TAPython/Python/ActorRenameTool/ActorRenameTool/__init__.py
tmp-project/TA/TAPython/Python/ActorRenameTool/MenuConfig.snippet.json
tmp-project/TA/TAPython/UI/MenuConfig.json
```

`zip-package/menuconfig-validation.txt` 显示：

```text
MenuConfig JSON valid
```

## 与 CLI 安装的差异

| 项目 | CLI 安装 | 手动 ZIP 安装 |
| --- | --- | --- |
| hash 校验 | CLI 自动执行 | 人工执行 `shasum` |
| 文件复制 | CLI 自动写入 | 人工复制 |
| MenuConfig 合并 | CLI 结构化合并 | 人工编辑 JSON |
| 安装账本 | 自动生成 `.tool-hub/installed.json` | 默认没有 |
| 备份 | 自动生成 `MenuConfig.json.bak.*` | 需要人工提前备份 |

## 人工验收

1. ZIP sha256 必须与页面/API 展示一致。
2. 解压内容必须包含 `manifest.json`、`README.md`、`tool.md`、`MenuConfig.snippet.json` 和 `ActorRenameTool/`。
3. 复制后的工具文件 sha256 必须与 manifest 中的文件 hash 一致。
4. `MenuConfig.json` 必须仍是合法 JSON。
5. 在真实 UE 项目中，需要 Reload TAPython 或重启 UE 编辑器后确认菜单入口可见。
