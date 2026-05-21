---
schemaVersion: 1.0.0
slug: scene-tools
name: SceneTools
displayName: 场景工具集
version: 1.0.0
releasedAt: '2026-05-14'
updatedAt: '2026-05-14'
author: 吴俊枫
ownerTeam: 场景B组
status: approved
description: >-
  场景批处理工具集：按范围与物件类型批量选择 Actor、批量重置变换、Actor 落地吸附、渲染属性批改、接受贴花开关、贴花转平面模型、无效 Actor
  扫描清理，以及对齐/分布/阵列操作。
manifestDescription: 场景批处理工具集
category: level-editing
riskLevel: medium
sourceMode: markdown-with-external-files
tags:
  - scene
  - batch
  - actor
  - transform
  - level-editing
  - ground-snap
  - decal
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
    - >-
      按范围（当前关卡/所有关卡）与物件类型（StaticMesh/Blueprint/点光源/聚光灯/方向光/矩形光/天空光/贴花/摄像机/触发器）批量选择
      Actor
    - 批量重置 Actor 变换：位置归零、旋转归零、缩放归一、全变换重置，通过 ScopedEditorTransaction 支持 Ctrl+Z 撤销
    - 导出已选 Actor 的 Tag 为 CSV 文件
    - Actor 落地吸附：预览+执行射线检测贴地，支持配置偏移量、射线距离、起始偏移与碰撞 Profile，支持大批量分帧任务
    - 批量修改渲染属性：Actor 隐藏、Cast Shadow、组件隐藏/可见、Draw Distance，支持预览+执行+分帧任务
    - 批量开关 StaticMeshComponent 的 Receives Decals，支持预览+执行+分帧任务
    - 贴花转平面模型：将选中 DecalActor 生成等比例 Plane StaticMeshActor，可赋予源材质并隐藏源贴花
    - 无效 Actor 清理：扫描关卡中的空节点与缺失 StaticMesh Actor，支持标记 Tag、软删除（移入隐藏文件夹）、导出扫描报告
    - 对齐/分布/阵列：按 X/Y/Z 轴对齐首个 Actor、等距分布，或按步长阵列，支持预览+执行+分帧任务
  unrealApis:
    - unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    - unreal.EditorActorSubsystem.get_all_level_actors
    - unreal.EditorActorSubsystem.get_selected_level_actors
    - unreal.EditorActorSubsystem.set_selected_level_actors
    - unreal.ScopedEditorTransaction
    - unreal.PythonBPLib.get_chameleon_data
    - unreal.ChameleonData.get_chameleon_window_size
    - unreal.ChameleonData.set_chameleon_window_size
    - unreal.StaticMeshActor
    - unreal.PointLight
    - unreal.SpotLight
    - unreal.DirectionalLight
    - unreal.RectLight
    - unreal.SkyLight
    - unreal.DecalActor
    - unreal.CameraActor
    - unreal.TriggerVolume
    - unreal.Vector2D
    - unreal.log
    - unreal.log_warning
    - unreal.log_error
  widgetAkas:
    - scene_tools_scroll
    - chk_scope_current
    - chk_scope_all
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
    - btn_select_all
    - btn_deselect_all
    - btn_execute
    - btn_clear_selection
    - txt_status
    - btn_ground_preview
    - btn_ground_execute
    - input_ground_threshold
    - input_ground_offset
    - input_ground_max_distance
    - input_ground_start_offset
    - input_ground_profile
    - txt_ground_snap_preview
    - input_export_path
    - chk_render_actor_hidden_enabled
    - chk_render_actor_hidden_value
    - chk_render_cast_shadow_enabled
    - chk_render_cast_shadow_value
    - chk_render_component_hidden_enabled
    - chk_render_component_hidden_value
    - chk_render_component_visible_enabled
    - chk_render_component_visible_value
    - chk_render_draw_distance_enabled
    - input_render_draw_distance
    - btn_render_preview
    - btn_render_execute
    - txt_render_property_preview
    - chk_receives_decals_value
    - btn_receives_decals_preview
    - btn_receives_decals_execute
    - txt_receives_decals_preview
    - input_decal_plane_suffix
    - chk_decal_plane_copy_material
    - chk_decal_plane_hide_source
    - btn_decal_plane_preview
    - btn_decal_plane_execute
    - txt_decal_to_plane_preview
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
    - txt_invalid_actor_result_info
    - btn_invalid_actor_select_selected_results
    - btn_invalid_actor_export_report
    - list_invalid_actor_results
    - txt_invalid_actor_preview
    - chk_align_axis_x
    - chk_align_axis_y
    - chk_align_axis_z
    - input_align_step
    - txt_align_preview
  installSteps:
    - 将 SceneTools/ 目录复制到 <Project>/TA/TAPython/Python/
    - >-
      在 <Project>/TA/TAPython/UI/MenuConfig.json 的 OnToolBarChameleon.items 中追加
      MenuConfig.snippet.json 中的条目
    - 在 UE 编辑器中执行 Reload TAPython 或重启编辑器
    - 在 Chameleon 工具栏下拉菜单中找到 'Scene Tools' 并点击打开
  riskNotes:
    - 变换重置操作（位置/旋转/缩放归零）通过 ScopedEditorTransaction 包裹，支持 Ctrl+Z 完整撤销
    - 落地吸附执行修改 Actor 位置，通过 ScopedEditorTransaction 支持撤销
    - 无效 Actor 软删除：将 Actor 移入指定文件夹并隐藏，该操作不可通过 Ctrl+Z 完全还原，建议操作前手动保存关卡
    - 贴花转平面生成新 Actor，但原贴花不删除；若勾选'隐藏源贴花'则会修改原 Actor 可见性，不可通过 Ctrl+Z 撤销
menuConfigMerge:
  target: <Project>/TA/TAPython/UI/MenuConfig.json
  mountPoint: OnToolBarChameleon
  itemsToAdd:
    - name: Scene Tools
      tooltip: >-
        场景工具集：按范围和类型批量选择、批量重置变换、落地吸附、渲染属性批改、接受贴花开关、贴花转平面模型、无效 Actor
        清理，以及对齐/分布/阵列操作。
      ChameleonTools: ../Python/SceneTools/SceneTools.json
      ExtensionHookName: OnToolBarChameleon
preInstallChecks:
  - 确认项目已安装并启用 TAPython 插件
  - 确认 <Project>/TA/TAPython/UI/MenuConfig.json 文件可写
  - 确认 Python/ 目录下没有同名 SceneTools 模块冲突
postInstallSteps:
  - 在 UE 编辑器中执行 Reload TAPython 或重启编辑器
  - 在 Chameleon 工具栏（场景工具集图标下拉）中确认 'Scene Tools' 条目可见并可正常打开
uninstallSteps:
  - 删除 <Project>/TA/TAPython/Python/SceneTools/ 目录
  - >-
    从 <Project>/TA/TAPython/UI/MenuConfig.json 的 OnToolBarChameleon.items 中移除
    Scene Tools 对应条目
  - 重启 UE 编辑器或 Reload TAPython
previousVersions: []
---

# 场景工具集

场景批处理工具集，面向关卡美术与 TA，提供 9 大功能面板：批量选择、变换重置、落地吸附、渲染属性批改、接受贴花、贴花转平面、无效 Actor 清理，以及对齐/分布/阵列。所有修改操作均提供预览+执行两步确认，批量操作支持分帧调度避免卡顿。

## 快速开始

1. 将 `SceneTools/` 目录整体复制到 `<Project>/TA/TAPython/Python/`
2. 打开 `<Project>/TA/TAPython/UI/MenuConfig.json`，在 `OnToolBarChameleon.items` 数组末尾追加 `MenuConfig.snippet.json` 中的条目
3. 在 UE 编辑器菜单执行 **Reload TAPython**（或重启编辑器）
4. 点击 Chameleon 工具栏 → **Scene Tools** 打开面板

## 文件清单

| 文件名 | 用途 | 存放路径 |
|-------|------|---------|
| `SceneTools.json` | Chameleon UI 定义（根面板 + 9 大功能区） | `Python/SceneTools/SceneTools.json` |
| `SceneTools.py` | Python 控制器（`SceneToolsController`） | `Python/SceneTools/SceneTools.py` |
| `__init__.py` | Python 包初始化（空文件） | `Python/SceneTools/__init__.py` |
| `MenuConfig.snippet.json` | MenuConfig 合并片段 | 工具目录根 |

## 架构简述

- **工具名**：SceneTools  
- **控制器类**：`SceneToolsController`（位于 `SceneTools.py`）  
- **挂载点**：`OnToolBarChameleon`  
- **入口 JSON**：`../Python/SceneTools/SceneTools.json`  
- **根控件**：`SScrollBox (Aka: scene_tools_scroll)` → 9 个 `SExpandableArea` 面板  
- **核心 API**：  
  - `unreal.EditorActorSubsystem`（批量获取/选中 Actor）  
  - `unreal.ScopedEditorTransaction`（变换操作可撤销包裹）  
  - `unreal.PythonBPLib.get_chameleon_data`（UI 数据绑定）  
  - `unreal.ChameleonData.*`（窗口尺寸自适应）  

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

### 1. 选择工具

1. 在"选择范围"中选择"当前关卡"或"所有关卡"  
2. 在"物件类型"中勾选需要选择的类型（静态网格体、蓝图、各类灯光、贴花、摄像机、触发器）  
3. 点击**批量选择**执行；点击**取消所有选择**清空当前 Viewport 选中  

### 2. 变换工具

1. 在 Viewport 中选中目标 Actor  
2. 点击**位置归零 / 旋转归零 / 缩放归一 / 全变换重置**（均支持 Ctrl+Z 撤销）  
3. 如需导出 Actor Tag 为 CSV，填写导出路径后点击**导出 Tag**  

### 3. 落地吸附

1. 在 Viewport 中选中目标 Actor  
2. 点击**预览落地**查看将被移动的 Actor 及目标 Z 值  
3. 确认预览结果后点击**执行落地**  
4. 可通过"阈值/偏移/射线距离/起始偏移/Profile"字段精细控制行为  

### 4. 渲染属性批处理

1. 选中目标 Actor  
2. 勾选需要修改的属性并设置目标值  
3. 点击**预览**查看影响范围，再点击**执行**写入  

### 5. 接受贴花

1. 选中 StaticMeshActor  
2. 设置"目标状态"开关  
3. 点击**预览** → **执行**  

### 6. 贴花转平面

1. 在 Viewport 中选中 `DecalActor`  
2. 配置命名后缀、是否赋予材质、是否隐藏源贴花  
3. 点击**预览贴花转平面** → **执行贴花转平面**  

### 7. 无效 Actor 清理

1. 点击**刷新关卡列表**，在列表中选择要扫描的关卡（Ctrl/Shift 多选）  
2. 勾选扫描类型（空 Actor / 缺失 StaticMesh）  
3. 点击**预览无效 Actor** 查看扫描结果  
4. 点击**仅标记 Tag** 为无效 Actor 打标记，或点击**软删除无效 Actor** 将其移入隐藏文件夹  
5. 可点击**导出报告**保存扫描结果 TXT  

### 8. 对齐 / 分布

1. 选中 2+ 个 Actor  
2. 选择轴向（X/Y/Z）和操作模式  
3. 点击**预览**查看目标位置，再点击**执行**  

## 注意事项

- **软删除不可完全撤销**：执行前建议手动保存关卡（Ctrl+S）  
- **贴花隐藏不可撤销**：若勾选"隐藏源贴花"，执行后无法通过 Ctrl+Z 还原  
- 变换重置、落地吸附、渲染属性、对齐/分布均通过 `ScopedEditorTransaction` 包裹，支持 Ctrl+Z 撤销  
- 大批量操作（>50 个 Actor）将自动启用分帧调度（`_FRAME_TASK_CHUNK_SIZE = 50`），避免编辑器卡顿  

## Agent 安装指令

```text
读取本文档 front matter 中的 installPath 与 entryJson。
1. 将 SceneTools/ 目录完整复制到 installPath 所指位置
2. 读取 menuConfigMerge.target 指定的 MenuConfig.json
3. 在 OnToolBarChameleon.items 数组末尾追加 menuConfigMerge.itemsToAdd[0] 中的对象
4. 保存 MenuConfig.json
5. 提示用户在 UE 编辑器中执行 Reload TAPython
```
