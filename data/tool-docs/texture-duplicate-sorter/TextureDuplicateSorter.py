# -*- coding: utf-8 -*-

import unreal
from Utilities.Utils import Singleton


DEFAULT_SCAN_PATH = "/Game"
TEXTURE_PACKAGE_NAME = "/Script/Engine"
TEXTURE_ASSET_NAME = "Texture2D"
GROUP_COLUMN_COUNT = 2
TEXTURE_CLASS_NAMES = {
    "texture",
    "texture2d",
    "texture2darray",
    "texturecube",
    "texturecubearray",
    "texturerendertarget",
    "texturerendertarget2d",
    "texturerendertarget2darray",
    "texturerendertargetcube",
    "virtualtexture2d",
    "runtimevirtualtexture",
    "volumetexture",
    "sparsevolumetexture"
}


class TextureDuplicateSorter(metaclass=Singleton):
    def __init__(self, json_path: str):
        self.json_path = json_path
        self.data = None

        self.ui_scan_path = "ScanPathText"
        self.ui_duplicate_only = "DuplicateOnlyCheckBox"
        self.ui_status = "StatusText"
        self.ui_group_panel = "GroupPanel"
        self.ui_group_list = "GroupList"

        self.groups = []
        self.last_scan_detail = ""

        try:
            self.data = unreal.PythonBPLib.get_chameleon_data(self.json_path)
            self.show_group_panel()
            self._set_status("就绪。双击列表项复制名称，并在内容浏览器中定位所有同名纹理。")
        except Exception as error:
            unreal.log_error("同名纹理排序器初始化失败：{}".format(error))

    def refresh_groups(self):
        if not self.data:
            return

        try:
            scan_path = self.data.get_text(self.ui_scan_path) or DEFAULT_SCAN_PATH
            scan_path = self._normalize_scan_path(scan_path)
            self.data.set_text(self.ui_scan_path, scan_path)
            self._set_status("正在扫描 {} 下的纹理...".format(scan_path))

            texture_assets = self._load_texture_asset_data(scan_path)
            duplicate_only = self.data.get_is_checked(self.ui_duplicate_only)
            self.groups = self._build_groups(texture_assets, duplicate_only)
            self._show_groups_in_list()
            self.show_group_panel()
            self._set_status("扫描到 {} 个纹理资产，{} 个名称组。{}".format(len(texture_assets), len(self.groups), self.last_scan_detail))
        except Exception as error:
            self._log_and_status("刷新失败", error)

    def show_group_panel(self):
        if not self.data:
            return

        try:
            self.data.set_visibility(self.ui_group_panel, "Visible")
        except Exception as error:
            self._log_and_status("显示列表页失败", error)

    def copy_group_name(self, group_index):
        if not self.data:
            return

        try:
            index = int(group_index)
        except Exception:
            return

        if index < 0 or index >= len(self.groups):
            return

        try:
            group = self.groups[index]
            group_name = group["name"]
            assets = group["assets"]
            copied = self._copy_text_to_clipboard(group_name)
            located = self._locate_assets_in_content_browser(assets)

            status_parts = []
            status_parts.append("已复制纹理名称：{}".format(group_name) if copied else "复制失败：{}".format(group_name))
            status_parts.append("已在内容浏览器定位 {} 个同名纹理。".format(len(assets)) if located else "内容浏览器定位同名纹理失败。")
            self._set_status(" ".join(status_parts))
        except Exception as error:
            self._log_and_status("复制名称失败", error)

    def diagnose_content_browser(self):
        if not self.data:
            return

        scan_path = self._normalize_scan_path(self.data.get_text(self.ui_scan_path) or DEFAULT_SCAN_PATH)
        content_browser_path = self._to_content_browser_folder_path(scan_path)
        sample_name = self.groups[0]["name"] if self.groups else ""
        lines = []
        lines.append("========== 同名纹理排序器：内容浏览器诊断 ==========")
        lines.append("json_path: {}".format(self.json_path))
        lines.append("scan_path: {}".format(scan_path))
        lines.append("content_browser_path: {}".format(content_browser_path))
        lines.append("groups_count: {}".format(len(self.groups)))
        lines.append("sample_name: {}".format(sample_name if sample_name else "<无，先刷新列表可获得样本名称>"))

        self._append_object_methods(
            lines,
            "PythonBPLib",
            unreal.PythonBPLib,
            [
                "get_selected_folder",
                "set_selected_folder_path",
                "set_selected_folder",
                "sync_to_assets",
                "get_selected_assets_paths",
                "set_selected_assets_by_paths",
                "set_clipboard_content",
                "get_clipboard_content"
            ]
        )
        self._append_object_methods(
            lines,
            "EditorAssetLibrary",
            unreal.EditorAssetLibrary,
            ["sync_browser_to_objects"]
        )

        lines.append("selected_folder_before: {}".format(self._safe_get_selected_folder()))
        self._diagnose_folder_call(lines, "PythonBPLib.set_selected_folder(content_browser_path)", lambda: unreal.PythonBPLib.set_selected_folder([content_browser_path]), scan_path)
        self._diagnose_folder_call(lines, "PythonBPLib.set_selected_folder(scan_path)", lambda: unreal.PythonBPLib.set_selected_folder([scan_path]), scan_path)
        self._diagnose_folder_call(lines, "PythonBPLib.set_selected_folder_path(content_browser_path)", lambda: unreal.PythonBPLib.set_selected_folder_path(content_browser_path), scan_path)
        self._diagnose_folder_call(lines, "PythonBPLib.set_selected_folder_path(scan_path)", lambda: unreal.PythonBPLib.set_selected_folder_path(scan_path), scan_path)
        self._diagnose_folder_call(lines, "EditorAssetLibrary.sync_browser_to_objects(content_browser_path)", lambda: unreal.EditorAssetLibrary.sync_browser_to_objects([content_browser_path]), scan_path)
        self._diagnose_folder_call(lines, "EditorAssetLibrary.sync_browser_to_objects(scan_path)", lambda: unreal.EditorAssetLibrary.sync_browser_to_objects([scan_path]), scan_path)

        if self.groups:
            lines.append("-- 同名纹理定位接口调用测试 --")
            self._diagnose_locate_candidates(lines, self.groups[0]["assets"])
        else:
            lines.append("-- 同名纹理定位接口调用测试：跳过，无样本资产 --")

        self._diagnose_content_browser_subsystem(lines)
        self._diagnose_window_environment(lines)
        lines.append("========== 内容浏览器诊断结束 ==========")
        unreal.log_warning("\n".join(lines))
        self._set_status("内容浏览器诊断已写入 UE 日志。")

    def _diagnose_locate_candidates(self, lines, asset_data_list):
        self._diagnose_call(lines, "PythonBPLib.sync_to_assets(sample_assets)", lambda: unreal.PythonBPLib.sync_to_assets(asset_data_list, False, True))
        lines.append("selected_folder_after_sync_to_assets: {}".format(self._safe_get_selected_folder()))
        object_paths = [self._get_asset_object_path(asset_data) for asset_data in asset_data_list]
        object_paths = [object_path for object_path in object_paths if object_path]
        lines.append("sample_asset_paths: {}".format(", ".join(object_paths[:20]) if object_paths else "<无>"))
        if object_paths:
            self._diagnose_call(lines, "EditorAssetLibrary.sync_browser_to_objects(sample_assets)", lambda: unreal.EditorAssetLibrary.sync_browser_to_objects(object_paths))
            lines.append("selected_folder_after_sync_browser_to_objects_assets: {}".format(self._safe_get_selected_folder()))

    def _diagnose_content_browser_subsystem(self, lines):
        lines.append("-- ContentBrowserSubsystem 探测 --")
        subsystem_class = getattr(unreal, "ContentBrowserSubsystem", None)
        if not subsystem_class:
            lines.append("unreal.ContentBrowserSubsystem: 不存在")
            return
        lines.append("unreal.ContentBrowserSubsystem: 存在")
        try:
            subsystem = unreal.get_editor_subsystem(subsystem_class)
            lines.append("get_editor_subsystem(ContentBrowserSubsystem): {}".format(subsystem))
            keywords = ["search", "filter", "folder", "path", "sync", "browser"]
            method_names = [name for name in dir(subsystem) if any(keyword in name.lower() for keyword in keywords)]
            lines.append("ContentBrowserSubsystem candidate methods: {}".format(", ".join(sorted(method_names)) if method_names else "<无>"))
        except Exception as error:
            lines.append("ContentBrowserSubsystem 获取/枚举失败: {}".format(error))

    def _diagnose_window_environment(self, lines):
        lines.append("-- 窗口与剪贴板环境探测 --")
        foreground_info = self._get_foreground_window_info()
        lines.append("foreground_hwnd: {}".format(foreground_info[0]))
        lines.append("foreground_window_title: {}".format(foreground_info[1]))
        lines.append("clipboard_content: {}".format(self._safe_get_clipboard_content()))

    def _append_object_methods(self, lines, label, obj, method_names):
        lines.append("-- {} 方法可用性 --".format(label))
        for method_name in method_names:
            method = getattr(obj, method_name, None)
            lines.append("{}.{}: {}".format(label, method_name, "存在" if method else "不存在"))

    def _diagnose_call(self, lines, label, callback):
        try:
            result = callback()
            lines.append("{}: 调用成功，返回 {}".format(label, result))
            return True
        except Exception as error:
            lines.append("{}: 调用失败，异常 {}".format(label, error))
            return False

    def _diagnose_folder_call(self, lines, label, callback, scan_path):
        before = self._safe_get_selected_folder()
        call_success = self._diagnose_call(lines, label, callback)
        after = self._safe_get_selected_folder()
        lines.append("{}_before: {}".format(label, before))
        lines.append("{}_after: {}".format(label, after))
        lines.append("{}_selected_folder_matched: {}".format(label, call_success and self._selected_folder_matches(after, scan_path)))
        return call_success

    def _safe_get_selected_folder(self):
        try:
            if hasattr(unreal.PythonBPLib, "get_selected_folder"):
                return unreal.PythonBPLib.get_selected_folder()
        except Exception as error:
            return "get_selected_folder 异常：{}".format(error)
        return "get_selected_folder 不存在"

    def _switch_content_browser_to_path(self, scan_path):
        content_browser_path = self._to_content_browser_folder_path(scan_path)
        attempts = []
        if hasattr(unreal.PythonBPLib, "set_selected_folder"):
            attempts.append(("set_selected_folder(content_browser_path)", lambda: unreal.PythonBPLib.set_selected_folder([content_browser_path])))
            attempts.append(("set_selected_folder(scan_path)", lambda: unreal.PythonBPLib.set_selected_folder([scan_path])))
        if hasattr(unreal.PythonBPLib, "set_selected_folder_path"):
            attempts.append(("set_selected_folder_path(content_browser_path)", lambda: unreal.PythonBPLib.set_selected_folder_path(content_browser_path)))
            attempts.append(("set_selected_folder_path(scan_path)", lambda: unreal.PythonBPLib.set_selected_folder_path(scan_path)))
        attempts.append(("sync_browser_to_objects(content_browser_path)", lambda: unreal.EditorAssetLibrary.sync_browser_to_objects([content_browser_path])))
        attempts.append(("sync_browser_to_objects(scan_path)", lambda: unreal.EditorAssetLibrary.sync_browser_to_objects([scan_path])))

        for label, callback in attempts:
            try:
                before = self._safe_get_selected_folder()
                callback()
                after = self._safe_get_selected_folder()
                if self._selected_folder_matches(after, scan_path):
                    return True
                unreal.log_warning("{} 调用后内容浏览器路径未匹配。目标={}，调用前={}，调用后={}".format(label, content_browser_path, before, after))
            except Exception as error:
                unreal.log_warning("{} 失败：{}".format(label, error))
        return False

    def _locate_assets_in_content_browser(self, asset_data_list):
        if not asset_data_list:
            return False
        try:
            if hasattr(unreal.PythonBPLib, "sync_to_assets"):
                unreal.PythonBPLib.sync_to_assets(asset_data_list, False, True)
                self._log_locate_assets_result("PythonBPLib.sync_to_assets", asset_data_list)
                return True
        except Exception as error:
            unreal.log_warning("sync_to_assets 定位同名纹理失败：{}".format(error))

        try:
            object_paths = [self._get_asset_object_path(asset_data) for asset_data in asset_data_list]
            object_paths = [object_path for object_path in object_paths if object_path]
            if object_paths:
                unreal.EditorAssetLibrary.sync_browser_to_objects(object_paths)
                self._log_locate_assets_result("EditorAssetLibrary.sync_browser_to_objects", asset_data_list)
                return True
        except Exception as error:
            unreal.log_warning("sync_browser_to_objects 定位同名纹理失败：{}".format(error))
        return False

    def _log_locate_assets_result(self, method_name, asset_data_list):
        lines = []
        lines.append("========== 同名纹理排序器：定位同名纹理 ==========")
        lines.append("method: {}".format(method_name))
        lines.append("asset_count: {}".format(len(asset_data_list)))
        for object_path in [self._get_asset_object_path(asset_data) for asset_data in asset_data_list[:20]]:
            lines.append("asset: {}".format(object_path))
        if len(asset_data_list) > 20:
            lines.append("asset: ... 还有 {} 个".format(len(asset_data_list) - 20))
        lines.append("selected_folder_after_locate: {}".format(self._safe_get_selected_folder()))
        lines.append("========== 定位同名纹理结束 ==========")
        unreal.log_warning("\n".join(lines))

    def _get_foreground_window_info(self):
        try:
            import ctypes

            user32 = ctypes.windll.user32
            hwnd = user32.GetForegroundWindow()
            buffer = ctypes.create_unicode_buffer(512)
            user32.GetWindowTextW(hwnd, buffer, 512)
            return hwnd, buffer.value
        except Exception as error:
            return "<未知>", "前台窗口探测失败: {}".format(error)

    def _safe_get_clipboard_content(self):
        try:
            if hasattr(unreal.PythonBPLib, "get_clipboard_content"):
                return unreal.PythonBPLib.get_clipboard_content()
        except Exception as error:
            return "get_clipboard_content 异常：{}".format(error)
        return "get_clipboard_content 不存在"

    def _copy_text_to_clipboard(self, text):
        try:
            if hasattr(unreal.PythonBPLib, "set_clipboard_content"):
                unreal.PythonBPLib.set_clipboard_content(text)
                return True
        except Exception as error:
            unreal.log_warning("PythonBPLib 复制剪贴板失败：{}".format(error))
        try:
            if hasattr(unreal, "LowEntryExtendedStandardLibrary"):
                unreal.LowEntryExtendedStandardLibrary.clipboard_set(text)
                return True
        except Exception as error:
            unreal.log_warning("LowEntry 复制剪贴板失败：{}".format(error))
        try:
            if hasattr(unreal, "VictoryBPFunctionLibrary"):
                unreal.VictoryBPFunctionLibrary.victory_save_string_to_os_clipboard(text)
                return True
        except Exception as error:
            unreal.log_warning("Victory 复制剪贴板失败：{}".format(error))
        return False

    def _load_texture_asset_data(self, scan_path):
        registry = None
        try:
            registry = unreal.AssetRegistryHelpers.get_asset_registry()
            registry.search_all_assets(True)
            registry.scan_paths_synchronous([scan_path], False)
            registry.wait_for_completion()
        except Exception as error:
            unreal.log_warning("同名纹理排序器刷新资产注册表失败：{}".format(error))

        path_assets = []
        try:
            if registry:
                path_assets = registry.get_assets_by_path(scan_path, True, False) or []
        except Exception as error:
            unreal.log_warning("同名纹理排序器路径扫描失败：{}".format(error))

        texture_assets = [asset_data for asset_data in path_assets if self._is_texture_asset_data(asset_data)]
        if texture_assets:
            self.last_scan_detail = "路径内共 {} 个资产。".format(len(path_assets))
            return texture_assets

        try:
            texture_class_path = unreal.TopLevelAssetPath(TEXTURE_PACKAGE_NAME, TEXTURE_ASSET_NAME)
            asset_filter = unreal.ARFilter(
                package_paths=[scan_path],
                class_paths=[texture_class_path],
                recursive_paths=True,
                recursive_classes=True,
                include_only_on_disk_assets=False
            )
            assets = registry.get_assets(asset_filter) or []
            texture_assets = [asset_data for asset_data in assets if self._is_texture_asset_data(asset_data)]
            if texture_assets:
                self.last_scan_detail = "路径扫描 {} 个资产，类过滤 {} 个资产。".format(len(path_assets), len(assets))
                return texture_assets
        except Exception as error:
            unreal.log_warning("同名纹理排序器过滤扫描失败：{}".format(error))

        try:
            if registry:
                all_assets = registry.get_all_assets(False) or []
                path_prefix = scan_path.rstrip("/") + "/"
                assets = []
                for asset_data in all_assets:
                    asset_path = self._get_asset_path(asset_data)
                    if asset_path == scan_path or asset_path.startswith(path_prefix):
                        assets.append(asset_data)
                texture_assets = [asset_data for asset_data in assets if self._is_texture_asset_data(asset_data)]
                self.last_scan_detail = "路径扫描 {} 个资产，全局兜底 {} 个资产。".format(len(path_assets), len(assets))
                return texture_assets
        except Exception as error:
            self._log_and_status("备用资产扫描失败", error)
        self._log_scan_sample(path_assets)
        self.last_scan_detail = "路径内共 {} 个资产，但未识别到纹理类；已在 UE 日志写入类样本。".format(len(path_assets))
        return []

    def _build_groups(self, texture_assets, duplicate_only):
        groups_by_name = {}
        for asset_data in texture_assets:
            asset_name = str(self._asset_data_value(asset_data, "asset_name") or "")
            if not asset_name:
                continue
            groups_by_name.setdefault(asset_name, []).append(asset_data)

        groups = []
        for asset_name, assets in groups_by_name.items():
            if duplicate_only and len(assets) < 2:
                continue
            assets.sort(key=lambda asset_data: self._get_asset_path(asset_data).lower())
            groups.append({"name": asset_name, "assets": assets})

        groups.sort(key=lambda group: (-len(group["assets"]), group["name"].lower()))
        return groups

    def _show_groups_in_list(self):
        flattened_items = []
        for group in self.groups:
            flattened_items.extend([group["name"], str(len(group["assets"]))])
        self.data.set_list_view_multi_column_items(self.ui_group_list, flattened_items, GROUP_COLUMN_COUNT)

    def _is_texture_asset_data(self, asset_data):
        try:
            if not asset_data or not self._asset_data_value(asset_data, "is_valid"):
                return False
            if self._asset_data_value(asset_data, "is_redirector"):
                return False
            candidates = set()
            self._add_class_name_candidates(candidates, self._asset_data_value(asset_data, "asset_class_path"))
            self._add_class_name_candidates(candidates, self._asset_data_value(asset_data, "asset_class"))
            self._add_class_name_from_full_text(candidates, self._asset_data_value(asset_data, "get_full_name"))
            self._add_class_name_from_full_text(candidates, self._asset_data_value(asset_data, "get_export_text_name"))
            try:
                native_class = self._asset_data_value(asset_data, "find_asset_native_class")
                if native_class:
                    self._add_class_name_candidates(candidates, self._asset_data_value(native_class, "get_name"))
            except Exception:
                pass
            if self._has_texture_class_candidate(candidates):
                return True
            if candidates:
                return False

            try:
                asset = self._asset_data_value(asset_data, "get_asset")
                texture_class = getattr(unreal, "Texture", unreal.Texture2D)
                return isinstance(asset, texture_class)
            except Exception:
                return False
        except Exception as error:
            unreal.log_warning("纹理资产检查失败：{}".format(error))
            return False

    def _add_class_name_candidates(self, candidates, value):
        text = str(value)
        if not text or text == "None":
            return
        candidates.add(text)
        clean_text = text.replace("'", " ").replace('"', " ").replace("/", " ").replace(".", " ")
        clean_text = clean_text.replace("(", " ").replace(")", " ").replace(",", " ")
        clean_text = clean_text.replace("[", " ").replace("]", " ").replace("{", " ").replace("}", " ")
        for token in clean_text.split():
            candidates.add(token.strip())
        if "." in text:
            candidates.add(text.rsplit(".", 1)[-1].strip("'\") ]}"))
        for key in ["AssetName=", "asset_name=", "ClassName=", "class_name="]:
            if key in text:
                tail = text.split(key, 1)[1]
                tail = tail.split(",", 1)[0].split(")", 1)[0]
                candidates.add(tail.strip("'\" []{}"))

    def _add_class_name_from_full_text(self, candidates, value):
        text = str(value)
        if not text or text == "None":
            return
        class_text = text.split(" ", 1)[0]
        class_text = class_text.split("'", 1)[0]
        class_text = class_text.split('"', 1)[0]
        self._add_class_name_candidates(candidates, class_text)

    def _has_texture_class_candidate(self, candidates):
        for candidate in candidates:
            name = str(candidate).strip("'\" []{}()").lower()
            if name in TEXTURE_CLASS_NAMES:
                return True
            if name.startswith("texture") or name.endswith("texture"):
                return True
            if "texture2d" in name or "texturecube" in name or "virtualtexture" in name or "volumetexture" in name:
                return True
            if "rendertarget" in name and "texture" in name:
                return True
        return False

    def _log_scan_sample(self, asset_data_list, sample_count=8):
        if not asset_data_list:
            unreal.log_warning("同名纹理排序器扫描样本：路径内没有资产。")
            return
        lines = ["同名纹理排序器扫描样本："]
        for asset_data in asset_data_list[:sample_count]:
            try:
                lines.append(
                    "名称={}; class={}; class_path={}; full={}; export={}".format(
                        self._asset_data_value(asset_data, "asset_name"),
                        self._asset_data_value(asset_data, "asset_class"),
                        self._asset_data_value(asset_data, "asset_class_path"),
                        self._asset_data_value(asset_data, "get_full_name"),
                        self._asset_data_value(asset_data, "get_export_text_name")
                    )
                )
            except Exception as error:
                lines.append("读取样本失败：{}".format(error))
        unreal.log_warning("\n".join(lines))

    def _get_asset_path(self, asset_data):
        try:
            return str(self._asset_data_value(asset_data, "package_name") or "")
        except Exception:
            return ""

    def _get_asset_object_path(self, asset_data):
        package_name = self._get_asset_path(asset_data)
        asset_name = str(self._asset_data_value(asset_data, "asset_name") or "")
        if package_name and asset_name:
            return "{}.{}".format(package_name, asset_name)
        return package_name

    def _asset_data_value(self, asset_data, name):
        value = getattr(asset_data, name, None)
        if value is None:
            return None
        if callable(value):
            try:
                return value()
            except TypeError:
                return value
        return value

    def _normalize_scan_path(self, scan_path):
        normalized = scan_path.strip().replace("\\", "/")
        if not normalized:
            return DEFAULT_SCAN_PATH
        if not normalized.startswith("/"):
            normalized = "/" + normalized
        if normalized == "/All/Game":
            normalized = "/Game"
        elif normalized.startswith("/All/Game/"):
            normalized = "/Game" + normalized[len("/All/Game"):]
        elif normalized == "/All/Engine":
            normalized = "/Engine"
        elif normalized.startswith("/All/Engine/"):
            normalized = "/Engine" + normalized[len("/All/Engine"):]
        return normalized.rstrip("/") if len(normalized) > 1 else normalized

    def _to_content_browser_folder_path(self, scan_path):
        normalized = self._normalize_scan_path(scan_path)
        if normalized.startswith("/All/"):
            return normalized.rstrip("/") if len(normalized) > 1 else normalized
        if normalized == "/Game":
            return "/All/Game"
        if normalized.startswith("/Game/"):
            return "/All/Game" + normalized[len("/Game"):]
        if normalized == "/Engine":
            return "/All/Engine"
        if normalized.startswith("/Engine/"):
            return "/All/Engine" + normalized[len("/Engine"):]
        return normalized.rstrip("/") if len(normalized) > 1 else normalized

    def _selected_folder_matches(self, selected_folders, scan_path):
        expected = self._to_content_browser_folder_path(scan_path)
        expected_scan_path = self._normalize_scan_path(scan_path)
        for folder in self._selected_folder_texts(selected_folders):
            normalized_folder = self._normalize_selected_folder(folder)
            if normalized_folder == expected or normalized_folder == expected_scan_path:
                return True
        return False

    def _selected_folder_texts(self, selected_folders):
        if selected_folders is None:
            return []
        if isinstance(selected_folders, (list, tuple, set)):
            return [str(folder).strip().strip("'\"") for folder in selected_folders]
        text = str(selected_folders).strip()
        if text.startswith("[") and text.endswith("]"):
            inner_text = text[1:-1].strip()
            if not inner_text:
                return []
            return [part.strip().strip("'\"") for part in inner_text.split(",")]
        return [text.strip("'\"")]

    def _normalize_selected_folder(self, folder):
        normalized = str(folder).strip().replace("\\", "/").strip("'\"")
        if len(normalized) > 1:
            normalized = normalized.rstrip("/")
        if normalized == "/Game" or normalized.startswith("/Game/"):
            return self._to_content_browser_folder_path(normalized)
        return normalized

    def _set_status(self, text):
        if self.data:
            self.data.set_text(self.ui_status, text)

    def _log_and_status(self, prefix, error):
        message = "{}: {}".format(prefix, error)
        try:
            unreal.log_error(message)
        finally:
            self._set_status(message)


instance = None


def _get_instance():
    if instance:
        return instance
    unreal.log_error("同名纹理排序器尚未初始化，请关闭窗口后重新打开。")
    return None


def refresh_groups():
    tool = _get_instance()
    if tool:
        tool.refresh_groups()


def show_group_panel():
    tool = _get_instance()
    if tool:
        tool.show_group_panel()


def diagnose_content_browser():
    tool = _get_instance()
    if tool:
        tool.diagnose_content_browser()


def copy_group_name(group_index):
    tool = _get_instance()
    if tool:
        tool.copy_group_name(group_index)