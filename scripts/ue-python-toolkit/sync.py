#!/usr/bin/env python3
"""Read-only UE Python Toolkit scanner and deterministic package builder."""

from __future__ import annotations

import argparse
import ast
import hashlib
import io
import json
import re
import shutil
import sys
import uuid
import zipfile
from pathlib import Path
from typing import Any, Iterable


SCHEMA_VERSION = "1.0.0"
PACKAGE_SCHEMA_VERSION = "1.0.0"
SHELL_FILENAME = "00_Python_Main.py"
SHELL_SLUG = "ue-python-toolkit"
SHELL_NAME = "UEPythonToolkit"
SHELL_INSTALL_ROOT = "Python/UEPythonToolkit"
ALLOWED_PARAM_TYPES = {"str", "int", "float", "bool", "choice", "action", "section"}
FIXED_ZIP_TIME = (1980, 1, 1, 0, 0, 0)
SAFE_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")


class SyncError(RuntimeError):
    pass


def sha256_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def canonical_json_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")


def json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    raise SyncError(f"TOOL_META contains unsupported value type: {type(value).__name__}")


def parse_tool_meta(source: bytes, relative_path: str) -> dict[str, Any]:
    try:
        text = source.decode("utf-8-sig")
        tree = ast.parse(text, filename=relative_path)
    except (UnicodeDecodeError, SyntaxError) as error:
        raise SyncError(f"{relative_path}: Python parse failed: {error}") from error

    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign):
            continue
        if not any(isinstance(target, ast.Name) and target.id == "TOOL_META" for target in node.targets):
            continue
        try:
            metadata = ast.literal_eval(node.value)
        except Exception as error:
            raise SyncError(f"{relative_path}: TOOL_META is not a literal: {error}") from error
        if not isinstance(metadata, dict):
            raise SyncError(f"{relative_path}: TOOL_META must be an object")
        return json_safe(metadata)
    raise SyncError(f"{relative_path}: TOOL_META not found")


def candidate_module_id(relative_path: str, metadata: dict[str, Any]) -> str:
    declared = str(metadata.get("id", "") or "").strip().lower()
    if declared:
        if not SAFE_ID_PATTERN.fullmatch(declared):
            raise SyncError(f"{relative_path}: invalid TOOL_META.id '{declared}'")
        return declared
    digest = hashlib.sha1(relative_path.encode("utf-8")).hexdigest()[:12]
    return f"tool-{digest}"


def module_slug(module_id: str) -> str:
    normalized = module_id.lower().replace("_", "-")
    normalized = re.sub(r"[^a-z0-9-]+", "-", normalized).strip("-")
    if not normalized:
        raise SyncError(f"Cannot derive slug from module ID: {module_id}")
    return f"uept-{normalized}"


def scan_source(source_root: Path | str, shell_filename: str = SHELL_FILENAME) -> dict[str, Any]:
    root = Path(source_root)
    if not root.is_dir():
        raise SyncError(f"Source root does not exist: {root}")
    shell_path = root / shell_filename
    if not shell_path.is_file():
        raise SyncError(f"Shell file not found: {shell_path}")

    shell_content = shell_path.read_bytes()
    modules: list[dict[str, Any]] = []
    errors: list[str] = []
    seen_ids: dict[str, str] = {}

    for file_path in sorted(root.rglob("*.py"), key=lambda item: item.relative_to(root).as_posix()):
        if file_path == shell_path or "__pycache__" in file_path.parts or file_path.name.startswith("_"):
            continue
        relative_path = file_path.relative_to(root).as_posix()
        try:
            content = file_path.read_bytes()
            metadata = parse_tool_meta(content, relative_path)
            module_id = candidate_module_id(relative_path, metadata)
            previous_path = seen_ids.get(module_id)
            if previous_path:
                raise SyncError(f"duplicate module ID '{module_id}' also used by {previous_path}")
            seen_ids[module_id] = relative_path
            parameter_types = sorted({str(item.get("type", "str")) for item in metadata.get("params", []) if isinstance(item, dict)})
            unsupported_types = sorted(set(parameter_types) - ALLOWED_PARAM_TYPES)
            if unsupported_types:
                raise SyncError(f"unsupported parameter types: {', '.join(unsupported_types)}")
            category_path = relative_path.split("/")[:-1]
            modules.append({
                "moduleId": module_id,
                "sourcePath": relative_path,
                "sourceSha256": sha256_bytes(content),
                "metadataSha256": sha256_bytes(canonical_json_bytes(metadata)),
                "displayName": str(metadata.get("name") or file_path.stem),
                "description": str(metadata.get("description") or ""),
                "categoryPath": category_path,
                "destructive": bool(metadata.get("destructive", False)),
                "parameterTypes": parameter_types,
                "metadata": metadata,
                "sourceContent": content,
            })
        except SyncError as error:
            errors.append(str(error))

    snapshot_lines = [f"{shell_filename}:{sha256_bytes(shell_content)}"]
    snapshot_lines.extend(f"{item['sourcePath']}:{item['sourceSha256']}" for item in modules)
    categories = sorted({item["categoryPath"][0] for item in modules if item["categoryPath"]})
    return {
        "schemaVersion": SCHEMA_VERSION,
        "sourceRoot": str(root),
        "shell": {
            "sourcePath": shell_filename,
            "sourceSha256": sha256_bytes(shell_content),
            "sourceContent": shell_content,
        },
        "modules": modules,
        "toolCount": len(modules),
        "categories": categories,
        "errors": errors,
        "sourceSnapshotSha256": sha256_bytes("\n".join(snapshot_lines).encode("utf-8")),
    }


def bootstrap_registry(
    scan: dict[str, Any],
    collection_id: str,
    author: str,
    owner_team: str,
    released_at: str = "1970-01-01",
    module_id_overrides: dict[str, str] | None = None,
) -> dict[str, Any]:
    if scan["errors"]:
        raise SyncError("Cannot bootstrap registry with scan errors: " + "; ".join(scan["errors"]))
    modules = []
    overrides = module_id_overrides or {}
    source_paths = {item["sourcePath"] for item in scan["modules"]}
    unknown_overrides = sorted(set(overrides) - source_paths)
    if unknown_overrides:
        raise SyncError("ID overrides reference unknown source paths: " + ", ".join(unknown_overrides))
    used_ids: set[str] = set()
    for item in scan["modules"]:
        module_id = overrides.get(item["sourcePath"], item["moduleId"])
        if not SAFE_ID_PATTERN.fullmatch(module_id):
            raise SyncError(f"Invalid module ID override for {item['sourcePath']}: {module_id}")
        if module_id in used_ids:
            raise SyncError(f"Duplicate module ID after overrides: {module_id}")
        used_ids.add(module_id)
        modules.append({
            "moduleId": module_id,
            "slug": module_slug(module_id),
            "version": "1.0.0",
            "versionSourceVersion": "1.0.0",
            "versionSourceSha256": item["sourceSha256"],
            "sourcePath": item["sourcePath"],
            "sourceSha256": item["sourceSha256"],
            "metadataSha256": item["metadataSha256"],
            "displayName": item["displayName"],
            "description": item["description"],
            "categoryPath": item["categoryPath"],
            "riskLevel": "medium" if item["destructive"] else "low",
            "destructive": item["destructive"],
            "parameterTypes": item["parameterTypes"],
            "status": "active",
            "publicationStatus": "candidate",
        })
    return {
        "schemaVersion": SCHEMA_VERSION,
        "collectionId": collection_id,
        "author": author,
        "ownerTeam": owner_team,
        "releasedAt": released_at,
        "compatibility": {
            "unrealEngine": ["5.5"],
            "tapython": ["1.2+"],
            "plugins": ["TAPython"],
        },
        "shell": {
            "slug": SHELL_SLUG,
            "name": SHELL_NAME,
            "displayName": "UE Python 工具集",
            "version": "1.0.0",
            "versionSourceVersion": "1.0.0",
            "versionSourceSha256": scan["shell"]["sourceSha256"],
            "sourcePath": scan["shell"]["sourcePath"],
            "sourceSha256": scan["shell"]["sourceSha256"],
        },
        "modules": sorted(modules, key=lambda item: item["sourcePath"]),
    }


def classify_modules(scan: dict[str, Any], registry: dict[str, Any]) -> dict[str, Any]:
    scanned_by_path = {item["sourcePath"]: item for item in scan["modules"]}
    registry_by_path = {item["sourcePath"]: item for item in registry.get("modules", [])}
    results: list[dict[str, Any]] = []

    for source_path, registered in registry_by_path.items():
        scanned = scanned_by_path.get(source_path)
        if scanned is None:
            status = "missing"
            current_hash = None
        else:
            status = "unchanged" if scanned["sourceSha256"] == registered.get("sourceSha256") else "changed"
            current_hash = scanned["sourceSha256"]
        results.append({
            "moduleId": registered["moduleId"],
            "slug": registered.get("slug", module_slug(registered["moduleId"])),
            "sourcePath": source_path,
            "status": status,
            "registeredSha256": registered.get("sourceSha256"),
            "currentSha256": current_hash,
            "version": registered.get("version"),
        })

    for source_path, scanned in scanned_by_path.items():
        if source_path in registry_by_path:
            continue
        results.append({
            "moduleId": scanned["moduleId"],
            "slug": module_slug(scanned["moduleId"]),
            "sourcePath": source_path,
            "status": "new",
            "registeredSha256": None,
            "currentSha256": scanned["sourceSha256"],
            "version": None,
        })

    counts = {status: sum(1 for item in results if item["status"] == status) for status in ("new", "changed", "unchanged", "missing")}
    return {
        "schemaVersion": SCHEMA_VERSION,
        "collectionId": registry.get("collectionId"),
        "sourceSnapshotSha256": scan["sourceSnapshotSha256"],
        "toolCount": scan["toolCount"],
        "categories": scan["categories"],
        "counts": counts,
        "errors": scan["errors"],
        "modules": sorted(results, key=lambda item: (item["status"], item["sourcePath"])),
    }


def file_descriptor(path: str, content: bytes, role: str) -> dict[str, Any]:
    return {"path": path, "sha256": sha256_bytes(content), "size": len(content), "role": role}


def validate_registry(registry: dict[str, Any]) -> None:
    shell = registry.get("shell")
    if not isinstance(shell, dict):
        raise SyncError("Registry shell must be an object")
    shell_slug = str(shell.get("slug", ""))
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}", shell_slug):
        raise SyncError(f"invalid shell slug: {shell_slug}")
    if not re.fullmatch(r"[0-9A-Za-z][0-9A-Za-z._-]{0,63}", str(shell.get("version", ""))):
        raise SyncError(f"invalid shell version: {shell.get('version')}")
    if not re.fullmatch(r"[a-f0-9]{64}", str(shell.get("sourceSha256", ""))):
        raise SyncError("invalid shell sourceSha256")
    if (
        not re.fullmatch(r"[0-9A-Za-z][0-9A-Za-z._-]{0,63}", str(shell.get("versionSourceVersion", "")))
        or not re.fullmatch(r"[a-f0-9]{64}", str(shell.get("versionSourceSha256", "")))
    ):
        raise SyncError("shell version baseline is missing or invalid")

    seen_ids: set[str] = set()
    seen_slugs: set[str] = {shell_slug}
    seen_paths: set[str] = set()
    modules = registry.get("modules")
    if not isinstance(modules, list):
        raise SyncError("Registry modules must be an array")
    for module in modules:
        if not isinstance(module, dict):
            raise SyncError("Registry module entries must be objects")
        module_id = str(module.get("moduleId", ""))
        slug = str(module.get("slug", ""))
        source_path = str(module.get("sourcePath", "")).replace("\\", "/")
        version = str(module.get("version", ""))
        if not SAFE_ID_PATTERN.fullmatch(module_id):
            raise SyncError(f"invalid module ID: {module_id}")
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}", slug):
            raise SyncError(f"invalid module slug: {slug}")
        if not re.fullmatch(r"[0-9A-Za-z][0-9A-Za-z._-]{0,63}", version):
            raise SyncError(f"invalid module version: {version}")
        if not re.fullmatch(r"[a-f0-9]{64}", str(module.get("sourceSha256", ""))):
            raise SyncError(f"invalid module sourceSha256: {module_id}")
        if (
            not re.fullmatch(r"[0-9A-Za-z][0-9A-Za-z._-]{0,63}", str(module.get("versionSourceVersion", "")))
            or not re.fullmatch(r"[a-f0-9]{64}", str(module.get("versionSourceSha256", "")))
        ):
            raise SyncError(f"module version baseline is missing or invalid: {module_id}")
        if source_path.startswith("/") or any(segment in {"", ".", ".."} for segment in source_path.split("/")):
            raise SyncError(f"invalid registry sourcePath: {source_path}")
        if module_id in seen_ids or slug in seen_slugs or source_path.casefold() in seen_paths:
            raise SyncError(f"duplicate registry identity: {module_id} / {slug} / {source_path}")
        seen_ids.add(module_id)
        seen_slugs.add(slug)
        seen_paths.add(source_path.casefold())


def manifest_base(registry: dict[str, Any], slug: str, name: str, display_name: str, version: str) -> dict[str, Any]:
    released_at = registry.get("releasedAt", "1970-01-01")
    timestamp = f"{released_at}T00:00:00Z"
    return {
        "formatVersion": 2,
        "packageType": "TAPythonToolPackage",
        "schemaVersion": PACKAGE_SCHEMA_VERSION,
        "slug": slug,
        "name": name,
        "displayName": display_name,
        "version": version,
        "releasedAt": released_at,
        "author": registry["author"],
        "ownerTeam": registry["ownerTeam"],
        "description": "",
        "category": "utility",
        "toolType": "python-script",
        "riskLevel": "low",
        "tags": ["ue-python-toolkit"],
        "compatibility": registry["compatibility"],
        "dependencies": [],
        "install": {},
        "files": [],
        "menuEntries": [],
        "hotkeyEntries": {},
        "externalJson": [],
        "summary": {"features": [], "unrealApis": [], "widgetAkas": [], "riskNotes": []},
        "preInstallChecks": ["确认项目已安装 TAPython"],
        "postInstallSteps": ["重新打开 UE Python 工具集"],
        "uninstallSteps": [],
        "createdAt": timestamp,
        "updatedAt": timestamp,
    }


def zip_bytes(entries: Iterable[tuple[str, bytes]]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for entry_path, content in sorted(entries, key=lambda item: item[0]):
            info = zipfile.ZipInfo(entry_path, FIXED_ZIP_TIME)
            info.compress_type = zipfile.ZIP_STORED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, content, compress_type=zipfile.ZIP_STORED)
    return buffer.getvalue()


def package_bytes(manifest: dict[str, Any], payload_entries: list[tuple[str, bytes]]) -> bytes:
    entries = [("manifest.json", canonical_json_bytes(manifest)), *payload_entries]
    return zip_bytes(entries)


def build_packages(
    scan: dict[str, Any],
    registry: dict[str, Any],
    output_dir: Path | str,
    pilot_ids: set[str] | None = None,
) -> dict[str, Any]:
    if scan["errors"]:
        raise SyncError("Cannot build with scan errors: " + "; ".join(scan["errors"]))
    validate_registry(registry)
    output = Path(output_dir)
    scanned_by_path = {item["sourcePath"]: item for item in scan["modules"]}
    registry_modules = [item for item in registry["modules"] if item.get("status", "active") == "active"]
    selected_modules = [item for item in registry_modules if pilot_ids is None or item["moduleId"] in pilot_ids]
    if scan["shell"]["sourceSha256"] != registry["shell"].get("sourceSha256"):
        raise SyncError("Shell source changed; update registry hash and version bump before building")
    if (
        registry["shell"].get("version") == registry["shell"].get("versionSourceVersion")
        and scan["shell"]["sourceSha256"] != registry["shell"].get("versionSourceSha256")
    ):
        raise SyncError(f"Shell version is still {registry['shell'].get('version')} but source content changed")
    for registered in selected_modules:
        scanned = scanned_by_path.get(registered["sourcePath"])
        if scanned is None:
            raise SyncError(f"Registered source is missing: {registered['sourcePath']}")
        if scanned["sourceSha256"] != registered.get("sourceSha256"):
            raise SyncError(f"{registered['moduleId']}: source changed; version bump and registry update are required")
        if (
            registered.get("version") == registered.get("versionSourceVersion")
            and scanned["sourceSha256"] != registered.get("versionSourceSha256")
        ):
            raise SyncError(f"{registered['moduleId']}: version is still {registered.get('version')} but source content changed")
    output.mkdir(parents=True, exist_ok=True)

    approved_modules = [item for item in registry_modules if item.get("publicationStatus") == "approved"]
    lock = {
        "schemaVersion": SCHEMA_VERSION,
        "collectionId": registry["collectionId"],
        "shell": {"slug": registry["shell"]["slug"], "version": registry["shell"]["version"]},
        "modules": [
            {"moduleId": item["moduleId"], "slug": item["slug"], "version": item["version"], "sourceSha256": item["sourceSha256"]}
            for item in approved_modules
        ],
    }
    lock_content = canonical_json_bytes(lock)
    init_content = b"from .runtime import launch\n"
    runtime_content = scan["shell"]["sourceContent"]
    shell_files = [
        (f"{SHELL_INSTALL_ROOT}/runtime.py", runtime_content, "python"),
        (f"{SHELL_INSTALL_ROOT}/__init__.py", init_content, "python"),
        (f"{SHELL_INSTALL_ROOT}/collection.lock.json", lock_content, "metadata"),
    ]
    shell_manifest = manifest_base(
        registry,
        registry["shell"]["slug"],
        registry["shell"]["name"],
        registry["shell"]["displayName"],
        registry["shell"]["version"],
    )
    shell_manifest.update({
        "description": "统一管理场景C组分类 UE Python 工具的 Tkinter Shell。",
        "category": "pipeline",
        "tags": ["ue-python-toolkit", "tool-shell", "tkinter"],
        "install": {
            "pythonRoot": SHELL_INSTALL_ROOT,
            "targetPath": f"<Project>/TA/TAPython/{SHELL_INSTALL_ROOT}",
            "mountPoint": "OnToolbar",
        },
        "files": [file_descriptor(path, content, role) for path, content, role in shell_files],
        "menuEntries": [{
            "name": "UE Python 工具集",
            "command": "import UEPythonToolkit; UEPythonToolkit.launch()",
            "ExtensionHookName": "OnToolbar",
        }],
        "summary": {
            "features": ["按分类发现并运行独立 Python 工具", "统一渲染 TOOL_META 参数", "记录参数与运行日志"],
            "unrealApis": ["unreal.register_slate_post_tick_callback"],
            "widgetAkas": [],
            "riskNotes": ["Shell 本身不修改资产；具体风险由模块声明。"],
        },
        "uninstallSteps": ["确认已卸载所有模块后删除 UEPythonToolkit 目录"],
        "collection": {"id": registry["collectionId"], "role": "shell", "uiKind": "tkinter-shell"},
    })
    package_records = []
    shell_name = f"{registry['shell']['slug']}-{registry['shell']['version']}.tapython-tool.zip"
    shell_data = package_bytes(shell_manifest, [(path, content) for path, content, _role in shell_files])
    (output / shell_name).write_bytes(shell_data)
    package_records.append({"slug": registry["shell"]["slug"], "version": registry["shell"]["version"], "path": shell_name, "sha256": sha256_bytes(shell_data)})

    for registered in selected_modules:
        scanned = scanned_by_path.get(registered["sourcePath"])
        if scanned is None:
            raise SyncError(f"Registered source is missing: {registered['sourcePath']}")
        module_root = f"{SHELL_INSTALL_ROOT}/Modules/{registered['moduleId']}"
        tool_content = scanned["sourceContent"]
        module_metadata = {
            "schemaVersion": SCHEMA_VERSION,
            "collectionId": registry["collectionId"],
            "moduleId": registered["moduleId"],
            "slug": registered["slug"],
            "version": registered["version"],
            "displayName": registered["displayName"],
            "description": registered.get("description", ""),
            "categoryPath": registered.get("categoryPath", []),
            "riskLevel": registered.get("riskLevel", "medium"),
            "destructive": bool(registered.get("destructive", False)),
            "sourcePath": registered["sourcePath"],
            "sourceSha256": scanned["sourceSha256"],
            "toolMeta": scanned["metadata"],
        }
        metadata_content = canonical_json_bytes(module_metadata)
        module_files = [
            (f"{module_root}/tool.py", tool_content, "python"),
            (f"{module_root}/module.json", metadata_content, "metadata"),
        ]
        module_manifest = manifest_base(
            registry,
            registered["slug"],
            f"UEPTModule{hashlib.sha1(registered['moduleId'].encode('utf-8')).hexdigest()[:8]}",
            registered["displayName"],
            registered["version"],
        )
        module_manifest.update({
            "description": registered.get("description") or f"UE Python 工具集模块：{registered['displayName']}",
            "riskLevel": registered.get("riskLevel", "medium"),
            "tags": ["ue-python-toolkit", "module", *[segment.lower() for segment in registered.get("categoryPath", [])]],
            "dependencies": [registry["shell"]["slug"]],
            "install": {
                "pythonRoot": module_root,
                "targetPath": f"<Project>/TA/TAPython/{module_root}",
                "mountPoint": "OnToolbar",
            },
            "files": [file_descriptor(path, content, role) for path, content, role in module_files],
            "menuEntries": [],
            "summary": {
                "features": [registered.get("description") or registered["displayName"]],
                "unrealApis": [],
                "widgetAkas": [],
                "riskNotes": ["该模块会修改编辑器状态或资产。"] if registered.get("destructive") else ["该模块标记为只读或非破坏性。"],
            },
            "uninstallSteps": [f"删除 UEPythonToolkit/Modules/{registered['moduleId']} 目录"],
            "collection": {
                "id": registry["collectionId"],
                "role": "module",
                "moduleId": registered["moduleId"],
                "categoryPath": registered.get("categoryPath", []),
                "requiredShellVersion": registry["shell"]["version"],
                "sourceSha256": scanned["sourceSha256"],
            },
        })
        package_name = f"{registered['slug']}-{registered['version']}.tapython-tool.zip"
        package_data = package_bytes(module_manifest, [(path, content) for path, content, _role in module_files])
        (output / package_name).write_bytes(package_data)
        package_records.append({"slug": registered["slug"], "version": registered["version"], "path": package_name, "sha256": sha256_bytes(package_data)})

    build_report = {
        "schemaVersion": SCHEMA_VERSION,
        "collectionId": registry["collectionId"],
        "sourceSnapshotSha256": scan["sourceSnapshotSha256"],
        "packageCount": len(package_records),
        "packages": package_records,
    }
    (output / "build-report.json").write_bytes(canonical_json_bytes(build_report))
    return build_report


def load_json(path: Path | str) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_json(path: Path | str, value: Any) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(canonical_json_bytes(value))


def print_cli_json(value: Any) -> None:
    print(json.dumps(value, ensure_ascii=True, indent=2))


def read_config(path: Path | str) -> dict[str, Any]:
    config = load_json(path)
    required = ("sourceRoot", "registryPath", "reportPath", "outputRoot", "collectionId", "author", "ownerTeam")
    missing = [key for key in required if not config.get(key)]
    if missing:
        raise SyncError("Config missing required fields: " + ", ".join(missing))
    base = Path(path).resolve().parent
    for key in ("registryPath", "reportPath", "outputRoot"):
        candidate = Path(config[key])
        config[key] = str(candidate if candidate.is_absolute() else (base / candidate).resolve())
    if config.get("overridesPath"):
        overrides_path = Path(config["overridesPath"])
        config["overridesPath"] = str(overrides_path if overrides_path.is_absolute() else (base / overrides_path).resolve())
    source_root = Path(config["sourceRoot"]).resolve()
    for key in ("registryPath", "reportPath", "outputRoot"):
        candidate = Path(config[key]).resolve()
        try:
            candidate.relative_to(source_root)
        except ValueError:
            continue
        raise SyncError(f"{key} must not be inside sourceRoot: {candidate}")
    write_targets = {key: Path(config[key]).resolve() for key in ("registryPath", "reportPath", "outputRoot")}
    if len({str(path).casefold() for path in write_targets.values()}) != len(write_targets):
        raise SyncError("registryPath, reportPath, and outputRoot must be distinct")
    output_root = write_targets["outputRoot"]
    for key in ("registryPath", "reportPath"):
        try:
            write_targets[key].relative_to(output_root)
        except ValueError:
            continue
        raise SyncError(f"{key} must not be inside outputRoot: {write_targets[key]}")
    return config


def public_scan(scan: dict[str, Any]) -> dict[str, Any]:
    return {
        "schemaVersion": scan["schemaVersion"],
        "sourceRoot": scan["sourceRoot"],
        "sourceSnapshotSha256": scan["sourceSnapshotSha256"],
        "shell": {key: value for key, value in scan["shell"].items() if key != "sourceContent"},
        "toolCount": scan["toolCount"],
        "categories": scan["categories"],
        "errors": scan["errors"],
        "modules": [{key: value for key, value in item.items() if key not in {"sourceContent", "metadata"}} for item in scan["modules"]],
    }


def command_scan(config: dict[str, Any]) -> int:
    scan = scan_source(config["sourceRoot"])
    report = public_scan(scan)
    write_json(config["reportPath"], report)
    print_cli_json(report)
    return 0 if not scan["errors"] else 1


def command_bootstrap(config: dict[str, Any], write: bool, force: bool = False) -> int:
    scan = scan_source(config["sourceRoot"])
    overrides = load_json(config["overridesPath"]) if config.get("overridesPath") and Path(config["overridesPath"]).exists() else {}
    registry = bootstrap_registry(
        scan,
        config["collectionId"],
        config["author"],
        config["ownerTeam"],
        config.get("releasedAt", "1970-01-01"),
        overrides,
    )
    if write:
        if Path(config["registryPath"]).exists() and not force:
            raise SyncError("Registry already exists; refusing to overwrite without --force")
        write_json(config["registryPath"], registry)
    print_cli_json(registry)
    return 0


def command_dry_run(config: dict[str, Any]) -> int:
    scan = scan_source(config["sourceRoot"])
    if Path(config["registryPath"]).exists():
        registry = load_json(config["registryPath"])
        report = classify_modules(scan, registry)
    else:
        registry = bootstrap_registry(scan, config["collectionId"], config["author"], config["ownerTeam"], config.get("releasedAt", "1970-01-01"))
        report = classify_modules(scan, {**registry, "modules": []})
    write_json(config["reportPath"], report)
    print_cli_json(report)
    return 0 if not report["errors"] else 1


def command_build(config: dict[str, Any], pilot_ids: set[str] | None) -> int:
    before = scan_source(config["sourceRoot"])
    registry = load_json(config["registryPath"])
    output = Path(config["outputRoot"])
    output.parent.mkdir(parents=True, exist_ok=True)
    staging = output.parent / f".{output.name}.staging-{uuid.uuid4().hex}"
    backup = output.parent / f".{output.name}.backup-{uuid.uuid4().hex}"
    try:
        result = build_packages(before, registry, staging, pilot_ids)
        after = scan_source(config["sourceRoot"])
        if before["sourceSnapshotSha256"] != after["sourceSnapshotSha256"]:
            raise SyncError("Source changed during build; generated artifacts are invalid")
        if output.exists():
            output.rename(backup)
        try:
            staging.rename(output)
        except Exception:
            if backup.exists() and not output.exists():
                backup.rename(output)
            raise
        if backup.exists():
            shutil.rmtree(backup)
    finally:
        if staging.exists():
            shutil.rmtree(staging)
        if backup.exists() and output.exists():
            shutil.rmtree(backup)
    print_cli_json(result)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True, help="Path to integration config.json")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("scan")
    bootstrap = subparsers.add_parser("bootstrap")
    bootstrap.add_argument("--write", action="store_true")
    bootstrap.add_argument("--force", action="store_true")
    subparsers.add_parser("dry-run")
    build = subparsers.add_parser("build")
    build.add_argument("--pilot", action="append", default=[], help="Module ID to build; repeat for multiple pilots")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        config = read_config(args.config)
        if args.command == "scan":
            return command_scan(config)
        if args.command == "bootstrap":
            return command_bootstrap(config, args.write, args.force)
        if args.command == "dry-run":
            return command_dry_run(config)
        if args.command == "build":
            return command_build(config, set(args.pilot) or None)
        raise SyncError(f"Unsupported command: {args.command}")
    except (OSError, ValueError, SyncError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
