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
