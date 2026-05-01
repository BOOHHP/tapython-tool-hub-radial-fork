---
schemaVersion: "1.0.0"
slug: actor-rename-tool
name: ActorRenameTool
displayName: Actor Rename Tool
version: "1.1.0"
releasedAt: "2026-04-30"
updatedAt: "2026-04-30"
author: TA Team
ownerTeam: Technical Art
status: approved
description: 场景 Actor 批量重命名与 Tag 管理工具，支持查找替换、批量编号重命名、Tag 添加与清除。
manifestDescription: 场景 Actor 批量重命名与 Tag 管理工具
category: level-editing
riskLevel: medium
sourceMode: markdown-with-external-files
tags:
  - actor
  - batch-rename
  - tag
  - chameleon
  - level-editing
compatibility:
  unrealEngine: ["5.3", "5.4", "5.5"]
  tapython: ["1.2+"]
  plugins: ["TAPython"]
dependencies: []
mountPoint: OnToolBarChameleon
installPath: <Project>/TA/TAPython/Python/ActorRenameTool/
entryJson: ActorRenameTool/ActorRenameTool.json
changeSummary: 补充 Tag 管理、选中 Actor 预览和更完整的状态反馈。
summary:
  features:
    - 选中 Actor 名称查找替换
    - 按基础名和编号批量重命名
    - 添加名称同名 Tag
    - 清除或批量添加编号 Tag
    - 预览当前选中 Actor 和 Tags
  unrealApis:
    - unreal.EditorLevelLibrary.get_selected_level_actors
    - actor.get_actor_label
    - actor.set_actor_label
    - actor.tags
    - unreal.PythonBPLib.get_chameleon_data
  widgetAkas:
    - input_find
    - input_replace
    - chk_case_sensitive
    - input_base_name
    - input_start_index
    - input_padding
    - txt_actor_list
    - txt_status
  installSteps:
    - 下载工具包并解压 ActorRenameTool 文件夹。
    - 复制到 <Project>/TA/TAPython/Python/ActorRenameTool/。
    - 将 MenuConfig.snippet.json 合并到 <Project>/TA/TAPython/UI/MenuConfig.json。
    - Reload TAPython 或重启 UE 编辑器。
  riskNotes:
    - 批量重命名会覆盖 Actor 显示名称。
    - 清除所有 Tag 操作不可撤销，执行前需要确认选择范围。
    - 安装时会修改项目 MenuConfig.json。
menuConfigMerge:
  target: <Project>/TA/TAPython/UI/MenuConfig.json
  mountPoint: OnToolBarChameleon
  itemsToAdd:
    - name: Actor Rename Tool
      ChameleonTools: ../Python/ActorRenameTool/ActorRenameTool.json
      ExtensionHookName: OnToolBarChameleon
preInstallChecks:
  - 确认项目已安装 TAPython
  - 确认 MenuConfig.json 可写
  - 确认目标目录不存在同名未备份工具
postInstallSteps:
  - Reload TAPython 或重启 UE 编辑器
  - 在 Chameleon 工具栏中确认工具入口可见
uninstallSteps:
  - 删除 <Project>/TA/TAPython/Python/ActorRenameTool/
  - 从 MenuConfig.json 移除对应 items 项
previousVersions:
  - version: "1.0.0"
    releasedAt: "2026-04-20"
    changeSummary: 首版提供 Actor 查找替换和基础批量编号重命名。
    files:
      - path: ActorRenameTool/ActorRenameTool.json
        sha256: 4f390e2147acbbf1-ui-v100
        size: 11840
      - path: ActorRenameTool/ActorRenameTool.py
        sha256: c3d4e9d1a7910a44-py-v100
        size: 6520
      - path: ActorRenameTool/__init__.py
        sha256: e3b0c44298fc1c14-empty
        size: 0
      - path: MenuConfig.snippet.json
        sha256: 55c7c28c0c5f-menu-v100
        size: 156
    manifestOverrides:
      description: 场景 Actor 批量重命名工具
      tags: ["actor", "batch-rename"]
      compatibility:
        unrealEngine: ["5.3", "5.4"]
        tapython: ["1.2+"]
        plugins: ["TAPython"]
      preInstallChecks:
        - 确认项目已安装 TAPython
        - 确认 MenuConfig.json 可写
      postInstallSteps:
        - Reload TAPython 或重启 UE 编辑器
---

# Actor Rename Tool

> 场景 Actor 批量重命名与 Tag 管理工具，支持查找替换、批量编号重命名、Tag 添加与清除。

## 快速开始

1. 将 `ActorRenameTool/` 文件夹复制到 `<Project>/TA/TAPython/Python/` 目录下。
2. 将下方菜单配置合并到 `<Project>/TA/TAPython/UI/MenuConfig.json` 的 `OnToolBarChameleon` 挂载点。
3. 重启 UE 编辑器或通过 TAPython 菜单 Reload，即可在工具栏看到工具入口。

## 文件清单

| 文件 | 用途 | 存放路径 |
|------|------|----------|
| `ActorRenameTool.json` | UI 界面定义 | `Python/ActorRenameTool/` |
| `ActorRenameTool.py` | 业务逻辑 | `Python/ActorRenameTool/` |
| `__init__.py` | 模块初始化 | `Python/ActorRenameTool/` |
| `MenuConfig.snippet.json` | 菜单挂载片段 | `TA/TAPython/UI/` |

## 架构简述

- 工具名称：`ActorRenameTool`
- 挂载点：`OnToolBarChameleon`
- 核心 API：`unreal.EditorLevelLibrary.get_selected_level_actors()`、`actor.get_actor_label()`、`actor.set_actor_label()`、`actor.tags`、`unreal.PythonBPLib.get_chameleon_data()`
- 核心控件 Aka：`input_find`、`input_replace`、`chk_case_sensitive`、`input_base_name`、`input_start_index`、`input_padding`、`txt_actor_list`、`txt_status`

## MenuConfig

```json menuconfig path=MenuConfig.snippet.json
@file:MenuConfig.snippet.json
```

## View

UI 定义较长，采用外部文件模式维护。构建脚本会读取引用文件并计算 hash。

```json chameleon-ui path=ActorRenameTool/ActorRenameTool.json
@file:ActorRenameTool.json
```

## Controller

Python Controller 较长，采用外部文件模式维护。Agent 安装时会将该文件写入目标工具目录。

```python controller path=ActorRenameTool/ActorRenameTool.py
@file:ActorRenameTool.py
```

## 使用说明

1. 在 UE 编辑器工具栏点击 Chameleon 下拉菜单中的 Actor Rename Tool。
2. 在场景视口或 World Outliner 中选中需要操作的 Actor。
3. 根据需求执行查找替换、批量重命名、Tag 添加或清理。
4. 点击刷新按钮可查看当前选中 Actor 的名称和 Tag 信息。
5. 所有操作结果会在底部状态栏显示。

## 注意事项

- 操作前请确认选中范围，批量重命名会覆盖 Actor 显示名称。
- 查找替换留空替换字段时，相当于删除匹配字符串。
- 清除所有 Tag 操作不可撤销，请谨慎使用。
- 安装时会修改 `MenuConfig.json`，建议让 Agent 展示合并 diff 后再执行。

## Agent 安装指令

Agent 可以直接读取本 Markdown，解析 front matter、文件清单、MenuConfig 片段和外部文件引用，生成安装预览。安装前必须展示将写入的目标路径、文件列表、hash 校验结果和 MenuConfig 合并 diff。