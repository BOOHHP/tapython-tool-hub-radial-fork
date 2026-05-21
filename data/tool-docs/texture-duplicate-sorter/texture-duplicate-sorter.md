---
schemaVersion: 1.0.0
slug: texture-duplicate-sorter
name: TextureDuplicateSorter
displayName: 同名纹理排序器
version: 1.0.0
releasedAt: '2026-05-21'
updatedAt: '2026-05-21'
author: CC
ownerTeam: CC
status: approved
description: 扫描路径下所有纹理，按照同名数量排序，双击快速定位所有同名纹理并复制名称，辅助清理重复纹理
manifestDescription: 同名纹理扫描定位
category: asset-management
riskLevel: low
sourceMode: markdown-with-external-files
tags:
  - texture
  - duplicate
  - asset-cleanup
  - content-browser
compatibility:
  unrealEngine:
    - '5.5'
  tapython:
    - 1.2+
  plugins:
    - TAPython
dependencies: []
mountPoint: OnToolBarChameleon
installPath: <Project>/TA/TAPython/Python/TextureDuplicateSorter/
entryJson: TextureDuplicateSorter/TextureDuplicateSorter.json
changeSummary: 首版发布
summary:
  features:
    - 扫描指定路径下所有纹理资产，按文件名分组
    - 按同名数量降序排列，快速定位重复纹理
    - 双击列表项复制纹理名称到剪贴板
    - 双击同时在内容浏览器中高亮定位所有同名纹理
    - 支持仅显示同名纹理过滤
    - 内置内容浏览器诊断功能
  unrealApis:
    - unreal.AssetRegistryHelpers.get_asset_registry
    - unreal.PythonBPLib.sync_to_assets
    - unreal.PythonBPLib.set_clipboard_content
    - unreal.EditorAssetLibrary.sync_browser_to_objects
    - unreal.PythonBPLib.get_chameleon_data
  widgetAkas:
    - ScanPathText
    - DuplicateOnlyCheckBox
    - StatusText
    - GroupPanel
    - GroupList
  installSteps:
    - 将 TextureDuplicateSorter/ 目录复制到 <Project>/TA/TAPython/Python/
    - >-
      将 MenuConfig.snippet.json 内容合并到 <Project>/TA/TAPython/UI/MenuConfig.json 的
      OnToolBarChameleon.items 中
    - Reload TAPython 或重启 UE 编辑器
  riskNotes:
    - 本工具仅执行只读扫描和内容浏览器定位操作，不修改任何资产
menuConfigMerge:
  target: <Project>/TA/TAPython/UI/MenuConfig.json
  mountPoint: OnToolBarChameleon
  itemsToAdd:
    - name: 同名纹理排序器
      ChameleonTools: ../Python/TextureDuplicateSorter/TextureDuplicateSorter.json
      ExtensionHookName: OnToolBarChameleon
preInstallChecks:
  - 确认项目已安装 TAPython
  - 确认 MenuConfig.json 可写
postInstallSteps:
  - Reload TAPython 或重启 UE 编辑器
  - 在 Chameleon 工具栏中确认「同名纹理排序器」入口可见
uninstallSteps:
  - 删除 <Project>/TA/TAPython/Python/TextureDuplicateSorter/
  - 从 MenuConfig.json 的 OnToolBarChameleon.items 中移除「同名纹理排序器」条目
previousVersions:
  - version: 1.0.0
    releasedAt: '2026-05-21'
    changeSummary: 首版发布
    files:
      - path: TextureDuplicateSorter/TextureDuplicateSorter.json
        sha256: 868fa29ac12dd01af2469796290203b4bf339fc4e66d9a1bdc0692f2e82c51db
        size: 6490
      - path: TextureDuplicateSorter/TextureDuplicateSorter.py
        sha256: 1419b413ec82fc0f7fbf371a5afb23ae73e55d4f6de776ded926189b3b94698c
        size: 29838
      - path: TextureDuplicateSorter/__init__.py
        sha256: a74e1250e61c5bd3598f2e0282f1b626d66c084694fe4143ccb4c726ca5c2d80
        size: 125
      - path: TextureDuplicateSorter/MenuConfig.snippet.json
        sha256: e1717520077123d7edc4b05a9ea01d2e4a71446d4d4be8198351238c12ec8f33
        size: 178
---

# 同名纹理排序器

> 扫描路径下所有纹理，按照同名数量排序，双击快速定位所有同名纹理并复制名称，辅助清理重复纹理。

## 快速开始

1. 将 `TextureDuplicateSorter/` 目录复制到 `<Project>/TA/TAPython/Python/`
2. 将 `MenuConfig.snippet.json` 内容合并到 `<Project>/TA/TAPython/UI/MenuConfig.json` 的 `OnToolBarChameleon.items` 数组中
3. Reload TAPython 或重启 UE 编辑器，在 Chameleon 工具栏中打开「同名纹理排序器」

## 文件清单

| 文件名 | 用途 | 存放路径 |
|--------|------|---------|
| TextureDuplicateSorter.json | UI 界面定义 | `<Project>/TA/TAPython/Python/TextureDuplicateSorter/` |
| TextureDuplicateSorter.py | 控制器逻辑 | `<Project>/TA/TAPython/Python/TextureDuplicateSorter/` |
| __init__.py | 模块初始化 | `<Project>/TA/TAPython/Python/TextureDuplicateSorter/` |
| MenuConfig.snippet.json | 菜单注册片段 | `<Project>/TA/TAPython/Python/TextureDuplicateSorter/` |

## 架构简述

- **工具名**：TextureDuplicateSorter
- **挂载点**：OnToolBarChameleon
- **核心 API**：`unreal.AssetRegistryHelpers.get_asset_registry`、`unreal.PythonBPLib.sync_to_assets`、`unreal.EditorAssetLibrary.sync_browser_to_objects`
- **核心控件 Aka**：`ScanPathText`（扫描路径输入）、`DuplicateOnlyCheckBox`（仅同名过滤）、`GroupList`（结果列表）、`StatusText`（状态栏）

## MenuConfig

```json menuconfig path=MenuConfig.snippet.json
@file:MenuConfig.snippet.json
```

## View

```json chameleon-ui path=TextureDuplicateSorter/TextureDuplicateSorter.json
@file:TextureDuplicateSorter.json
```

## Controller

```python controller path=TextureDuplicateSorter/TextureDuplicateSorter.py
@file:TextureDuplicateSorter.py
```

## 使用说明

1. 在 Chameleon 工具栏下拉菜单中点击「同名纹理排序器」打开工具面板
2. 在「扫描路径」输入框中填入目标路径（默认 `/Game`）
3. 勾选「仅显示同名」可过滤掉只出现一次的纹理
4. 点击「刷新」按钮开始扫描
5. 结果列表按同名数量降序排列，双击任意行：
   - 纹理名称自动复制到剪贴板
   - 所有同名纹理在内容浏览器中高亮定位
6. 如遇内容浏览器定位异常，点击「诊断内容浏览器」按钮，诊断信息将输出到 UE 日志

## 注意事项

- 本工具为只读操作，不会修改、删除或移动任何资产
- 大型项目首次扫描可能需要数秒（取决于资产数量）
- 扫描路径支持 `/Game`、`/Engine` 及其子路径
- 内容浏览器定位依赖 `PythonBPLib.sync_to_assets`，不同 UE/TAPython 版本行为可能略有差异

## Agent 安装指令

Agent 读取本文档后执行安装：

1. 解析 front matter 获取 `installPath` 和 `entryJson`
2. 将 `@file:` 引用的外部文件写入 `installPath` 对应目录
3. 读取 `menuConfigMerge` 配置，将 `itemsToAdd` 合并到目标 `MenuConfig.json` 的 `OnToolBarChameleon.items` 数组末尾
4. 执行 `postInstallSteps` 中的操作确认安装成功
