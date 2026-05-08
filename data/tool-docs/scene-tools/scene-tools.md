---
schemaVersion: 1.0.0
slug: scene-tools
name: SceneTools
displayName: Scene Tools
version: 1.0.0
releasedAt: '2026-05-08'
updatedAt: '2026-05-08'
author: WuJunFeng
ownerTeam: Scene Team B
status: approved
description: >-
  场景工具集，提供按范围与类型批量选择 Actor、变换归零、落地吸附、渲染属性批量修改、接受贴花开关、贴花转平面、无效 Actor
  清理及对齐/阵列分布等场景批处理功能。
manifestDescription: 场景 Actor 批量处理工具集
category: level-editing
riskLevel: medium
sourceMode: markdown-with-external-files
tags:
  - scene
  - actor
  - batch
  - transform
  - ground-snap
  - render
  - level-editing
compatibility:
  unrealEngine:
    - '5.5'
  tapython:
    - 1.2+
  plugins:
    - TAPython
dependencies: []
mountPoint: OnToolBarChameleon
installPath: <Project>/TA/TAPython/Python/SceneTools/
entryJson: SceneTools/SceneTools.json
changeSummary: 首版发布
summary:
  features:
    - 按物件类型（静态网格体、蓝图、灯光、贴花、摄像机、触发器）和范围（当前/所有关卡）批量选择 Actor
    - 批量重置 Actor 变换（位置归零、旋转归零、缩放归一），支持 Ctrl+Z 撤销
    - Actor Tags 批量导出为 CSV 文件
    - Actor 落地吸附（地面贴合），支持预览与分帧执行
    - 批量修改渲染属性（Actor/组件隐藏、投射阴影、绘制距离等）
    - 批量开关静态网格组件的接受贴花属性
    - 贴花转平面模型（可选保留材质及隐藏源贴花）
    - 无效 Actor 扫描、标记与软删除（支持多关卡选择）
    - 多轴 Actor 批量对齐、等距分布与阵列操作
  unrealApis:
    - unreal.EditorActorSubsystem
    - unreal.EditorLevelLibrary.get_current_level
    - unreal.EditorLevelLibrary.get_editor_world
    - unreal.EditorLevelUtils.get_levels
    - unreal.EditorAssetLibrary.load_asset
    - unreal.SystemLibrary.line_trace_single_by_profile
    - unreal.ScopedEditorTransaction
    - unreal.ChameleonData.get_chameleon_window_size
    - unreal.ChameleonData.set_chameleon_window_size
    - unreal.PythonBPLib.get_chameleon_data
    - unreal.PythonBPLib.set_timer
    - unreal.PythonBPLib.clear_timer
    - unreal.get_editor_subsystem
    - unreal.register_slate_post_tick_callback
    - unreal.unregister_slate_post_tick_callback
  widgetAkas:
    - scene_tools_scroll
    - chk_scope_current
    - chk_scope_all
    - btn_select_all
    - btn_deselect_all
    - chk_static_mesh
    - chk_blueprint
    - chk_point_light
    - chk_spot_light
    - chk_dir_light
    - chk_rect_light
    - chk_sky_light
    - chk_decal
    - chk_camera
    - chk_trigger
    - btn_execute
    - btn_clear_selection
    - txt_invalid_actor_level_info
    - btn_invalid_actor_refresh_levels
    - btn_invalid_actor_select_all_levels
    - list_invalid_actor_levels
    - chk_invalid_empty_actor
    - chk_invalid_missing_static_mesh
    - input_invalid_actor_marker_tag
    - input_invalid_actor_soft_delete_folder
    - btn_invalid_actor_preview
    - btn_invalid_actor_select_results
    - btn_invalid_actor_mark
    - btn_invalid_actor_soft_delete
    - txt_invalid_actor_preview
    - input_decal_plane_suffix
    - chk_decal_plane_copy_material
    - chk_decal_plane_hide_source
    - btn_decal_plane_preview
    - btn_decal_plane_execute
    - txt_decal_to_plane_preview
    - chk_receives_decals_value
    - btn_receives_decals_preview
    - btn_receives_decals_execute
    - txt_receives_decals_preview
    - chk_align_axis_x
    - chk_align_axis_y
    - chk_align_axis_z
    - input_align_step
    - txt_align_preview
    - chk_render_actor_hidden_enabled
    - chk_render_actor_hidden_value
    - chk_render_component_hidden_enabled
    - chk_render_component_hidden_value
    - chk_render_component_visible_enabled
    - chk_render_component_visible_value
    - chk_render_cast_shadow_enabled
    - chk_render_cast_shadow_value
    - chk_render_draw_distance_enabled
    - input_render_draw_distance
    - btn_render_preview
    - btn_render_execute
    - txt_render_property_preview
    - input_ground_profile
    - input_ground_max_distance
    - input_ground_threshold
    - input_ground_offset
    - input_ground_start_offset
    - btn_ground_preview
    - btn_ground_execute
    - txt_ground_snap_preview
    - input_export_path
    - txt_status
  installSteps:
    - 确认项目已安装 TAPython 插件
    - 将 SceneTools/ 文件夹复制到 <Project>/TA/TAPython/Python/
    - >-
      将 MenuConfig.snippet.json 的条目合并到 <Project>/TA/TAPython/UI/MenuConfig.json
      的 OnToolBarChameleon.items 数组中
    - 在 UE 编辑器中 Reload TAPython 或重启编辑器
  riskNotes:
    - 变换重置操作通过 ScopedEditorTransaction 封装，支持 Ctrl+Z 撤销
    - 渲染属性修改、接受贴花开关、对齐/分布操作通过事务封装，支持撤销
    - Actor 软删除操作将 Actor 移动到指定文件夹，不可通过 Ctrl+Z 撤销，请提前确认
    - 贴花转平面会在场景中新建 StaticMeshActor，如勾选隐藏源贴花则不可一键撤销
menuConfigMerge:
  target: <Project>/TA/TAPython/UI/MenuConfig.json
  mountPoint: OnToolBarChameleon
  itemsToAdd:
    - name: Scene Tools
      tooltip: 场景工具集：按范围和类型批量选择，以及隐藏/显示 Actor 可见性控制。
      ChameleonTools: ../Python/SceneTools/SceneTools.json
      ExtensionHookName: OnToolBarChameleon
preInstallChecks:
  - 确认项目已安装 TAPython 插件
  - 确认 <Project>/TA/TAPython/UI/MenuConfig.json 文件可写
  - 确认 <Project>/TA/TAPython/Python/ 目录存在
postInstallSteps:
  - 在 UE 编辑器中 Reload TAPython 或重启编辑器
  - 在 Chameleon 工具栏中点击 Scene Tools 确认工具窗口可正常打开
uninstallSteps:
  - 删除 <Project>/TA/TAPython/Python/SceneTools/ 目录
  - >-
    从 <Project>/TA/TAPython/UI/MenuConfig.json 的 OnToolBarChameleon.items 中移除
    Scene Tools 条目
previousVersions:
  - version: 1.0.0
    releasedAt: '2026-05-08'
    changeSummary: 首版发布
    files:
      - path: SceneTools/SceneTools.json
        sha256: 3242d99f8ed0ee9cb97fa0369629e24ffcede29bf8a506cca9f88e2474d0f174
        size: 133514
      - path: SceneTools/SceneTools.py
        sha256: f52fcd115ca331793eb94f3597873a4183895737bdb36bd0da2c0f4a3547921f
        size: 171212
      - path: SceneTools/__init__.py
        sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
        size: 0
---

# Scene Tools

> 场景工具集，覆盖 Actor 批量选择、变换归零、落地吸附、渲染属性修改、贴花处理、无效 Actor 清理、对齐/分布阵列等高频场景批处理需求。

## 快速开始

1. 将 `SceneTools/` 目录复制到 `<Project>/TA/TAPython/Python/`
2. 将以下 JSON 条目合并到 `<Project>/TA/TAPython/UI/MenuConfig.json` 的 `OnToolBarChameleon.items` 数组：
   ```json
   {
     "name": "Scene Tools",
     "tooltip": "场景工具集：按范围和类型批量选择，以及隐藏/显示 Actor 可见性控制。",
     "ExtensionHookName": "OnToolBarChameleon",
     "ChameleonTools": "../Python/SceneTools/SceneTools.json"
   }
   ```
3. 在 UE 编辑器中 Reload TAPython 或重启编辑器，从 Chameleon 工具栏打开工具。

## 文件清单

| 文件名 | 用途 | 存放路径 |
|--------|------|---------|
| `SceneTools.json` | Chameleon UI 布局（View） | `<Project>/TA/TAPython/Python/SceneTools/` |
| `SceneTools.py` | 业务逻辑控制器（Controller） | `<Project>/TA/TAPython/Python/SceneTools/` |
| `__init__.py` | Python 模块初始化（空文件） | `<Project>/TA/TAPython/Python/SceneTools/` |
| `MenuConfig.snippet.json` | MenuConfig 注册条目片段（安装参考） | 随提交文档，不需复制到项目 |

## 架构简述

- **工具名**：SceneTools / 场景工具集
- **Controller 类**：`SceneToolsController`
- **挂载点**：`OnToolBarChameleon`（Chameleon 工具栏下拉菜单）
- **入口 JSON**：`SceneTools/SceneTools.json`
- **核心 UE API**：
  - `unreal.EditorActorSubsystem`（Actor 选择与批量操作）
  - `unreal.EditorLevelLibrary`（关卡上下文）
  - `unreal.EditorLevelUtils.get_levels`（多关卡支持）
  - `unreal.SystemLibrary.line_trace_single_by_profile`（落地射线检测）
  - `unreal.ScopedEditorTransaction`（Ctrl+Z 撤销支持）
  - `unreal.PythonBPLib.set_timer` / `clear_timer`（分帧任务调度）
- **核心控件 Aka**（共 66 个）：`scene_tools_scroll`、`chk_scope_current`、`chk_scope_all`、`chk_static_mesh`、`chk_blueprint`、`btn_execute`、`txt_status` 等

## MenuConfig

```json menuconfig path=MenuConfig.snippet.json
@file:MenuConfig.snippet.json
```

## View

```json chameleon-ui path=SceneTools/SceneTools.json
@file:SceneTools.json
```

## Controller

```python controller path=SceneTools/SceneTools.py
@file:SceneTools.py
```

## 使用说明

### 选择工具
1. 在"选择范围"中选择**当前关卡**或**所有关卡**。
2. 勾选需要批量选择的物件类型（静态网格体、蓝图、点光源、聚光灯、平行光、矩形光、天空光、贴花、摄像机、触发器）。
3. 点击**执行选择**，工具会将符合条件的 Actor 加入选中集。

### 变换工具
1. 在视口或大纲中选中目标 Actor。
2. 根据需要点击：**位置归零**、**旋转归零**、**缩放归一**或**全变换重置**。
3. 操作包裹在 `ScopedEditorTransaction` 中，支持 **Ctrl+Z** 撤销。

### 落地吸附
1. 选中目标 Actor 后展开"落地吸附"面板。
2. 配置碰撞预设、最大检测距离、吸附阈值等参数。
3. 先点击**预览**查看修正计划，确认无误后点击**执行吸附**。

### 渲染属性批量修改
1. 选中目标 Actor，展开"渲染属性"面板。
2. 勾选需要修改的属性项并设置目标值。
3. 点击**预览**确认修改范围，再点击**执行**。

### 接受贴花批量开关
1. 选中包含 StaticMeshComponent 的 Actor。
2. 设置目标值（开/关），点击**预览**后执行。

### 贴花转平面
1. 选中 DecalActor，展开"贴花转平面"面板。
2. 可选配置：保留材质、隐藏源贴花、后缀名。
3. 预览确认后执行转换。

### 无效 Actor 清理
1. 展开"无效 Actor 清理"面板，刷新并选择目标关卡。
2. 配置检测规则（空 Actor、缺失静态网格体）。
3. 执行**预览扫描** → **标记**（打 Tag）或**软删除**（移动到指定文件夹）。

### 对齐 / 分布 / 阵列
1. 选中两个或以上 Actor。
2. 选择对齐轴（X / Y / Z），展开"对齐/分布"面板。
3. 执行**对齐到首个**、**等距分布**或**按步长阵列**。

## 注意事项

- 变换重置、渲染属性修改、对齐/分布通过 `ScopedEditorTransaction` 封装，**支持 Ctrl+Z 撤销**。
- **Actor 软删除**（将 Actor 移动到特定文件夹）**不可通过 Ctrl+Z 撤销**，请在执行前确认目标 Actor 列表。
- 贴花转平面勾选"隐藏源贴花"后，源 DecalActor 将被隐藏，如需恢复需手动操作。
- 分帧任务（大批量处理时自动开启）执行期间请勿关闭工具窗口。
- 工具依赖 TAPython 提供的 `PythonBPLib`，请确保项目已安装并启用 TAPython 插件。

## Agent 安装指令

Agent 可按以下方式读取本文档并完成安装：

1. **解析 YAML front matter**，获取 `installPath`（`<Project>/TA/TAPython/Python/SceneTools/`）和 `menuConfigMerge` 配置。
2. **展开 `@file:` 引用**：将 `SceneTools.json`、`SceneTools.py`、`__init__.py` 写入 `installPath`。
3. **合并 MenuConfig**：读取 `menuConfigMerge.target` 指向的 JSON 文件，在 `OnToolBarChameleon.items` 数组末尾追加 `menuConfigMerge.itemsToAdd` 中的条目（若同名条目已存在则跳过）。
4. **校验安装**：确认上述文件存在后，提示用户 Reload TAPython 或重启 UE 编辑器。
5. **文件完整性校验**（可选）：对照 `previousVersions[0].files` 中的 sha256 值验证写入文件是否一致。
