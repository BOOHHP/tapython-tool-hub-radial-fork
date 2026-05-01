---
schemaVersion: "1.0.0"
slug: test-selection-audit-tool
name: TestSelectionAuditTool
displayName: Test Selection Audit Tool
version: "0.2.0"
releasedAt: "2026-04-29"
updatedAt: "2026-04-29"
author: Tool Hub QA
ownerTeam: Pipeline QA
status: pending
description: 用于测试 Tool Hub 发布、检索、安装和版本对比流程的伪造工具，模拟对当前选中 Actor 进行轻量审计。
manifestDescription: 伪造的选中 Actor 审计工具，用于测试 Tool Hub 数据链路。
category: validation
riskLevel: low
sourceMode: markdown-with-external-files
tags:
  - test-fixture
  - validation
  - selection
  - audit
  - chameleon
compatibility:
  unrealEngine: ["5.4", "5.5"]
  tapython: ["1.2+"]
  plugins: ["TAPython"]
dependencies: []
mountPoint: OnToolBarChameleon
installPath: <Project>/TA/TAPython/Python/TestSelectionAuditTool/
entryJson: TestSelectionAuditTool/TestSelectionAuditTool.json
changeSummary: 增加 Actor 数量统计、空选择提示和可复制的审计摘要。
summary:
  features:
    - 统计当前选中 Actor 数量
    - 列出 Actor 名称与 Class 信息
    - 提醒空选择或超过建议数量的选择集
    - 生成可复制的测试审计摘要
  unrealApis:
    - unreal.EditorLevelLibrary.get_selected_level_actors
    - actor.get_actor_label
    - actor.get_class
    - unreal.PythonBPLib.get_chameleon_data
  widgetAkas:
    - txt_selection_count
    - txt_audit_result
    - btn_refresh_audit
    - btn_copy_summary
  installSteps:
    - 下载工具文档和引用文件。
    - 复制 TestSelectionAuditTool 文件夹到 <Project>/TA/TAPython/Python/TestSelectionAuditTool/。
    - 将 TestSelectionAuditTool.MenuConfig.snippet.json 合并到 <Project>/TA/TAPython/UI/MenuConfig.json。
    - Reload TAPython 后在工具栏打开测试工具。
  riskNotes:
    - 该测试工具只读取当前选中 Actor，不写入场景或资产。
    - pending 状态用于测试审核流程，不代表生产可用。
menuConfigMerge:
  target: <Project>/TA/TAPython/UI/MenuConfig.json
  mountPoint: OnToolBarChameleon
  itemsToAdd:
    - name: Test Selection Audit Tool
      ChameleonTools: ../Python/TestSelectionAuditTool/TestSelectionAuditTool.json
      ExtensionHookName: OnToolBarChameleon
preInstallChecks:
  - 确认项目已安装 TAPython
  - 确认该测试工具不会覆盖同名生产工具
postInstallSteps:
  - Reload TAPython 或重启 UE 编辑器
  - 在 Chameleon 工具栏确认 Test Selection Audit Tool 可见
uninstallSteps:
  - 删除 <Project>/TA/TAPython/Python/TestSelectionAuditTool/
  - 从 MenuConfig.json 移除对应 items 项
previousVersions:
  - version: "0.1.0"
    releasedAt: "2026-04-25"
    changeSummary: 首个测试版本，仅显示选中 Actor 数量。
    files:
      - path: TestSelectionAuditTool/TestSelectionAuditTool.json
        sha256: test-ui-v010-placeholder
        size: 940
      - path: TestSelectionAuditTool/TestSelectionAuditTool.py
        sha256: test-py-v010-placeholder
        size: 1180
      - path: TestSelectionAuditTool/__init__.py
        sha256: e3b0c44298fc1c14-empty
        size: 0
      - path: TestSelectionAuditTool.MenuConfig.snippet.json
        sha256: test-menu-v010-placeholder
        size: 168
    manifestOverrides:
      tags: ["test-fixture", "validation", "selection"]
      compatibility:
        unrealEngine: ["5.4"]
        tapython: ["1.2+"]
        plugins: ["TAPython"]
---

# Test Selection Audit Tool

> 这是一份用于 Tool Hub 功能测试的伪造工具文档。它模拟一个只读的 Chameleon 工具，用来验证发布、搜索、下载、安装说明和版本对比流程。

## 快速开始

1. 将 `TestSelectionAuditTool/` 文件夹复制到 `<Project>/TA/TAPython/Python/` 目录下。
2. 将下方菜单配置合并到 `<Project>/TA/TAPython/UI/MenuConfig.json` 的 `OnToolBarChameleon` 挂载点。
3. Reload TAPython 后打开 Test Selection Audit Tool。
4. 在关卡中选中若干 Actor，点击刷新审计结果。

## 文件清单

| 文件 | 用途 | 存放路径 |
|------|------|----------|
| `TestSelectionAuditTool.json` | UI 界面定义 | `Python/TestSelectionAuditTool/` |
| `TestSelectionAuditTool.py` | 测试 Controller | `Python/TestSelectionAuditTool/` |
| `__init__.py` | 模块初始化 | `Python/TestSelectionAuditTool/` |
| `TestSelectionAuditTool.MenuConfig.snippet.json` | 菜单挂载片段 | `TA/TAPython/UI/` |

## 架构简述

- 工具名称：`TestSelectionAuditTool`
- 挂载点：`OnToolBarChameleon`
- 核心 API：`unreal.EditorLevelLibrary.get_selected_level_actors()`、`actor.get_actor_label()`、`actor.get_class()`、`unreal.PythonBPLib.get_chameleon_data()`
- 核心控件 Aka：`txt_selection_count`、`txt_audit_result`、`btn_refresh_audit`、`btn_copy_summary`

## MenuConfig

```json menuconfig path=TestSelectionAuditTool.MenuConfig.snippet.json
@file:TestSelectionAuditTool.MenuConfig.snippet.json
```

## View

```json chameleon-ui path=TestSelectionAuditTool/TestSelectionAuditTool.json
@file:TestSelectionAuditTool.json
```

## Controller

```python controller path=TestSelectionAuditTool/TestSelectionAuditTool.py
@file:TestSelectionAuditTool.py
```

## 使用说明

1. 打开工具后点击刷新，工具会读取当前选中 Actor。
2. 工具会展示数量、名称和 Class 摘要。
3. 选择为空时会显示提示文本。
4. 该工具不修改场景内容，仅用于站点测试。

## 注意事项

- 这是测试夹具，不应作为正式生产工具发布。
- 该工具状态为 pending，用于验证审核状态筛选和详情页安全提示。
- 该工具不会写入 Actor、资产或项目配置；安装时仅需要合并菜单入口。

## Agent 安装指令

Agent 可以读取本 Markdown 并生成安装计划。安装前应展示目标目录、引用文件列表、manifest hash 和 MenuConfig 合并项。