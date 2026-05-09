---
schemaVersion: "1.0.0"
slug: asset-organizer
name: AssetOrganizer
displayName: Asset Tools
version: "1.0.0"
releasedAt: "2026-05-09"
updatedAt: "2026-05-09"
author: WuJunFeng
ownerTeam: Scene Team B
status: approved
description: "资产整理工具集，当前提供非 POT（Power-of-Two）纹理的批量扫描与修复功能，支持多目录扫描、内容浏览器路径快捷选取、结果列表同步及修复报告导出，后续将持续扩展纹理、材质、静态网格等资产治理功能。"
manifestDescription: "资产整理：非 POT 纹理扫描与修复"
category: asset-management
riskLevel: medium
sourceMode: markdown-with-external-files
tags:
  - asset
  - texture
  - power-of-two
  - asset-management
  - content-browser
compatibility:
  unrealEngine: ["5.5"]
  tapython: ["1.2+"]
  plugins: ["TAPython"]
dependencies: []
mountPoint: OnToolBarChameleon
installPath: <Project>/TA/TAPython/Python/AssetOrganizer/
entryJson: AssetOrganizer/AssetOrganizer.json
changeSummary: "首版发布：非 POT 纹理扫描与批量修复"
summary:
  features:
    - "扫描指定目录下宽高不是 2 的幂的 Texture2D 资产"
    - "支持多目录扫描列表，可通过内容浏览器快捷添加路径"
    - "使用 DetailsView 控件（AssetPathProxy）编辑扫描目录列表"
    - "批量修复：将 Power Of Two Mode 设为 Stretch To Power Of Two"
    - "可选修复后自动保存资产（save_loaded_asset）"
    - "结果列表支持多选并同步到内容浏览器"
    - "修复结果可导出为文本报告（保存至项目 Saved 目录）"
  unrealApis:
    - unreal.AssetRegistryHelpers.get_asset_registry
    - unreal.AssetRegistryHelpers.get_asset
    - unreal.AssetRegistryHelpers.get_tag_value
    - unreal.AssetRegistryHelpers.to_soft_object_path
    - unreal.EditorAssetLibrary.load_asset
    - unreal.EditorAssetLibrary.save_loaded_asset
    - unreal.EditorAssetLibrary.sync_browser_to_objects
    - unreal.EditorAssetLibrary.get_path_name_for_loaded_asset
    - unreal.EditorUtilityLibrary.get_selected_assets
    - unreal.EditorAssetSubsystem
    - unreal.ScopedEditorTransaction
    - unreal.ScopedSlowTask
    - unreal.PythonBPLib.get_chameleon_data
    - unreal.register_slate_post_tick_callback
    - unreal.unregister_slate_post_tick_callback
    - unreal.new_object
    - unreal.Paths.project_saved_dir
  widgetAkas:
    - asset_organizer_scroll
    - txt_non_pot_texture_path_info
    - details_non_pot_texture_paths
    - input_non_pot_texture_path
    - btn_non_pot_texture_add_cb_path
    - btn_non_pot_texture_apply_paths
    - btn_non_pot_texture_reset_paths
    - btn_non_pot_texture_focus_path
    - chk_non_pot_texture_recursive
    - chk_non_pot_texture_save
    - btn_non_pot_texture_preview
    - btn_non_pot_texture_fix
    - txt_non_pot_texture_result_info
    - btn_non_pot_texture_sync_selected
    - btn_non_pot_texture_export
    - list_non_pot_texture_results
    - txt_non_pot_texture_preview
    - txt_status
  installSteps:
    - "确认项目已安装 TAPython 插件"
    - "将 AssetOrganizer/ 文件夹复制到 <Project>/TA/TAPython/Python/"
    - "将 AssetMenuConfig.snippet.json 的条目合并到 MenuConfig.json 的 OnToolBarChameleon.items 数组"
    - "Reload TAPython 或重启 UE 编辑器"
  riskNotes:
    - "修复操作通过 ScopedEditorTransaction 封装，主要属性修改支持 Ctrl+Z 撤销"
    - "勾选'修复后保存'后会调用 save_loaded_asset 将修改落盘，不可通过 Ctrl+Z 撤销已保存的文件"
    - "扫描大型项目时可能耗时较长，进度由 ScopedSlowTask 显示"
menuConfigMerge:
  target: <Project>/TA/TAPython/UI/MenuConfig.json
  mountPoint: OnToolBarChameleon
  itemsToAdd:
    - name: Asset Tools
      tooltip: "资产整理工具集：纹理、材质、静态网格等 Content Browser 资产治理。"
      ChameleonTools: ../Python/AssetOrganizer/AssetOrganizer.json
      ExtensionHookName: OnToolBarChameleon
preInstallChecks:
  - "确认项目已安装 TAPython 插件"
  - "确认 <Project>/TA/TAPython/UI/MenuConfig.json 文件可写"
  - "确认 <Project>/TA/TAPython/Python/ 目录存在"
postInstallSteps:
  - "在 UE 编辑器中 Reload TAPython 或重启编辑器"
  - "在 Chameleon 工具栏中点击 Asset Tools 确认工具窗口可正常打开"
  - "工具首次打开时会注册 DetailsView tick 回调以绑定扫描目录编辑器，如遇绑定失败日志可忽略并重新打开"
uninstallSteps:
  - "删除 <Project>/TA/TAPython/Python/AssetOrganizer/ 目录"
  - "从 <Project>/TA/TAPython/UI/MenuConfig.json 的 OnToolBarChameleon.items 中移除 Asset Tools 条目"
previousVersions:
  - version: "1.0.0"
    releasedAt: "2026-05-09"
    changeSummary: "首版发布：非 POT 纹理扫描与批量修复"
    files:
      - path: AssetOrganizer/AssetOrganizer.json
        sha256: 950345017917339118c7d19b2e78af8d9b945ebcb3d4533d310f977a42cb9513
        size: 22276
      - path: AssetOrganizer/AssetOrganizer.py
        sha256: dc6cb15f02dffefc837bd5e672a5490a8a6fa70c07d2cf4a0ca51be70bf2ef04
        size: 60756
      - path: AssetOrganizer/AssetPathProxy.py
        sha256: 9f9bb68dabc05663ed68b91274a8759a435d1993604bf67ff3902aaee9bcdd0d
        size: 222
      - path: AssetOrganizer/__init__.py
        sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
        size: 0
---

# Asset Tools

> 资产整理工具集，提供非 POT 纹理的批量扫描与修复，支持多目录管理、内容浏览器联动、结果列表同步及修复报告导出。

## 快速开始

1. 将 `AssetOrganizer/` 目录复制到 `<Project>/TA/TAPython/Python/`
2. 将以下 JSON 条目合并到 `<Project>/TA/TAPython/UI/MenuConfig.json` 的 `OnToolBarChameleon.items` 数组：
   ```json
   {
     "name": "Asset Tools",
     "tooltip": "资产整理工具集：纹理、材质、静态网格等 Content Browser 资产治理。",
     "ExtensionHookName": "OnToolBarChameleon",
     "ChameleonTools": "../Python/AssetOrganizer/AssetOrganizer.json"
   }
   ```
3. 在 UE 编辑器中 Reload TAPython 或重启编辑器，从 Chameleon 工具栏打开工具。

## 文件清单

| 文件名 | 用途 | 存放路径 |
|--------|------|---------|
| `AssetOrganizer.json` | Chameleon UI 布局（View） | `<Project>/TA/TAPython/Python/AssetOrganizer/` |
| `AssetOrganizer.py` | 业务逻辑控制器（Controller） | `<Project>/TA/TAPython/Python/AssetOrganizer/` |
| `AssetPathProxy.py` | UObject 代理，用于 DetailsView 编辑扫描路径列表 | `<Project>/TA/TAPython/Python/AssetOrganizer/` |
| `__init__.py` | Python 模块初始化（空文件） | `<Project>/TA/TAPython/Python/AssetOrganizer/` |
| `AssetMenuConfig.snippet.json` | MenuConfig 注册条目片段（安装参考） | 随提交文档，不需复制到项目 |

## 架构简述

- **工具名**：AssetOrganizer / 资产整理工具集
- **Controller 类**：`AssetOrganizerController`
- **代理类**：`AssetPathProxy`（`@unreal.uclass()` 装饰的 UObject，通过 `details_non_pot_texture_paths` DetailsView 小部件暴露路径列表编辑器）
- **挂载点**：`OnToolBarChameleon`（Chameleon 工具栏下拉菜单）
- **入口 JSON**：`AssetOrganizer/AssetOrganizer.json`
- **核心 UE API**：
  - `unreal.AssetRegistryHelpers.get_asset_registry`（资产注册表查询）
  - `unreal.EditorAssetLibrary.load_asset` / `save_loaded_asset`（资产加载与保存）
  - `unreal.EditorAssetLibrary.sync_browser_to_objects`（内容浏览器同步）
  - `unreal.EditorUtilityLibrary.get_selected_assets`（获取内容浏览器选中资产）
  - `unreal.ScopedEditorTransaction`（Ctrl+Z 撤销支持）
  - `unreal.ScopedSlowTask`（大批量处理进度条）
  - `unreal.register_slate_post_tick_callback`（延迟绑定 DetailsView）
- **核心控件 Aka**（共 18 个）：`asset_organizer_scroll`、`details_non_pot_texture_paths`、`list_non_pot_texture_results`、`txt_status` 等

## MenuConfig

```json menuconfig path=AssetMenuConfig.snippet.json
@file:AssetMenuConfig.snippet.json
```

## View

```json chameleon-ui path=AssetOrganizer/AssetOrganizer.json
@file:AssetOrganizer.json
```

## Controller

```python controller path=AssetOrganizer/AssetOrganizer.py
@file:AssetOrganizer.py
```

## 使用说明

### 非 POT 纹理扫描与修复

1. **配置扫描目录**：工具打开后，顶部"扫描目录列表"区域默认扫描 `/Game`。
   - 点击**从内容浏览器添加**，选中目标文件夹或资产后导入路径。
   - 点击**应用路径列表**使路径生效；点击**重置**恢复为 `/Game`。
   - 可直接在 DetailsView 中编辑 `scan_paths` 数组（数组每项填写 `/Game/...` 格式路径）。
2. **配置选项**：
   - 勾选**递归扫描子目录**（默认已勾选）。
   - 勾选**修复后自动保存**：修复完毕后将调用 `save_loaded_asset` 保存资产文件。
3. **扫描预览**：点击**预览扫描**，工具将遍历 AssetRegistry 查找宽高不是 2 的幂的 Texture2D，结果显示在列表及预览文本框中。
4. **执行修复**：确认预览结果无误后，点击**修复**。工具将对每个待修复纹理设置 `power_of_two_mode = ETexturePowerOfTwoSetting.StretchToPowerOfTwo`。
5. **同步到内容浏览器**：在结果列表中选中一条或多条记录，点击**同步到内容浏览器**定位该纹理资产。
6. **导出报告**：点击**导出报告**将扫描与修复摘要保存为文本文件（路径：`<ProjectSaved>/NonPOTTextureReport_<时间戳>.txt`）。

## 注意事项

- 属性修改通过 `ScopedEditorTransaction` 封装，**在未保存前支持 Ctrl+Z 撤销**。
- 勾选"**修复后自动保存**"后会调用 `save_loaded_asset`，已保存的修改**不可通过 Ctrl+Z 撤销**，请谨慎使用。
- 工具仅设置 `Power Of Two Mode` 属性为 `Stretch To Power Of Two`，**不会重采样源图像**，不影响原始纹理文件。
- 首次打开工具时会通过 `register_slate_post_tick_callback` 延迟绑定 DetailsView；若日志出现绑定失败提示，关闭后重新打开工具即可。
- 扫描大型项目（/Game 根目录）时可能耗时较长，进度由编辑器底部 `ScopedSlowTask` 进度条显示，请勿在扫描期间关闭工具。

## Agent 安装指令

Agent 可按以下方式读取本文档并完成安装：

1. **解析 YAML front matter**，获取 `installPath`（`<Project>/TA/TAPython/Python/AssetOrganizer/`）和 `menuConfigMerge` 配置。
2. **展开 `@file:` 引用**：将 `AssetOrganizer.json`、`AssetOrganizer.py`、`AssetPathProxy.py`、`__init__.py` 写入 `installPath`。
3. **合并 MenuConfig**：读取 `menuConfigMerge.target` 指向的 JSON 文件，在 `OnToolBarChameleon.items` 数组末尾追加 `menuConfigMerge.itemsToAdd` 中的条目（若同名条目已存在则跳过）。
4. **校验安装**：确认上述 4 个文件存在后，提示用户 Reload TAPython 或重启 UE 编辑器。
5. **文件完整性校验**（可选）：对照 `previousVersions[0].files` 中的 sha256 值验证写入文件是否一致。
