# TAPython Tool Package v2

## Purpose

TAPython Tool Package v2 is the shared package contract for ToolHub, TAPython Installer, Agent installation, and future direct uploads from the installer.

The package is the source of truth for installation. Markdown documents are presentation artifacts generated from package metadata, not the canonical install contract.

## Goals

- One package format works for local export, ToolHub upload, ToolHub download, Agent install, and TAPython Installer import.
- Installers can preview file writes, config merges, hashes, overwrites, backups, uninstall actions, and post-install steps without reading Markdown.
- ToolHub can validate and index packages without reinterpreting ad hoc ZIP layouts.
- Existing ToolHub Markdown submissions and TAPython Installer v1 packages can be normalized into this format during migration.

## File Name

Recommended extension:

```text
<slug>-<version>.tapython-tool.zip
```

The installer may still accept `.zip`, but packages that contain a v2 `manifest.json` should be treated as TAPython Tool Package v2 regardless of file extension.

## Archive Layout

```text
manifest.json
Python/
  <ToolName>/
    <ToolName>.json
    <ToolName>.py
    __init__.py
Config/
  MenuConfig.items.json
  HotkeyConfig.items.json
Docs/
  README.md
  tool.md
Assets/
  ...
```

Required entries:

- `manifest.json`
- `Python/<ToolName>/...` with at least one installable file

Optional entries:

- `Config/MenuConfig.items.json`
- `Config/HotkeyConfig.items.json`
- `Docs/README.md`
- `Docs/tool.md`
- `Assets/**`

During the first ToolHub migration step, generated download ZIPs may contain only `manifest.json` and `Python/**`. In that layout, `menuEntries` and `hotkeyEntries` in `manifest.json` are the canonical config merge source; `Config/**` files are optional mirrors for tools that need a file-based export.

## Manifest Contract

`manifest.json` MUST be UTF-8 JSON without comments.

```json
{
  "formatVersion": 2,
  "packageType": "TAPythonToolPackage",
  "schemaVersion": "1.0.0",
  "slug": "asset-organizer",
  "name": "AssetOrganizer",
  "displayName": "Asset Tools",
  "version": "1.0.0",
  "releasedAt": "2026-05-21",
  "author": "WuJunFeng",
  "ownerTeam": "Scene Team B",
  "description": "Asset governance tool for Unreal Editor projects.",
  "category": "asset-management",
  "riskLevel": "medium",
  "tags": ["asset-management", "texture"],
  "compatibility": {
    "unrealEngine": ["5.5"],
    "tapython": ["1.2+"],
    "plugins": ["TAPython"]
  },
  "dependencies": [],
  "install": {
    "pythonRoot": "Python/AssetOrganizer",
    "targetPath": "<Project>/TA/TAPython/Python/AssetOrganizer",
    "entryJson": "AssetOrganizer/AssetOrganizer.json",
    "mountPoint": "OnToolBarChameleon"
  },
  "files": [
    {
      "path": "Python/AssetOrganizer/AssetOrganizer.py",
      "sha256": "<64-char hex>",
      "size": 12345,
      "role": "controller"
    }
  ],
  "menuEntries": [
    {
      "name": "Asset Tools",
      "ChameleonTools": "../Python/AssetOrganizer/AssetOrganizer.json",
      "ExtensionHookName": "OnToolBarChameleon"
    }
  ],
  "hotkeyEntries": {},
  "externalJson": [],
  "summary": {
    "features": [],
    "unrealApis": [],
    "widgetAkas": [],
    "riskNotes": []
  },
  "preInstallChecks": [],
  "postInstallSteps": [],
  "uninstallSteps": [],
  "createdAt": "2026-05-21T00:00:00Z",
  "updatedAt": "2026-05-21T00:00:00Z"
}
```

## Path Rules

- All package paths use `/` separators.
- Paths MUST be relative.
- Paths MUST NOT contain `.` or `..` path segments.
- Installable files SHOULD live under `Python/`.
- `install.pythonRoot` MUST point to a directory under `Python/`.
- `install.targetPath` MUST contain `<Project>` and resolve inside the selected Unreal project.
- `install.entryJson` is relative to `<Project>/TA/TAPython/Python/` for TAPython menu references.

## Hash Rules

Each file listed in `files` MUST exist in the archive and include:

- `path`
- `sha256` as lowercase 64-character hex
- `size` in bytes

The package-level SHA256 is computed over the final ZIP bytes and is stored by ToolHub outside the package manifest in its index/download metadata.

## Validation

ToolHub includes a local validator for v2 ZIP packages:

```powershell
npm run validate:v2-package -- apps\web\public\downloads\actor-rename-tool\1.2.0\actor-rename-tool-1.2.0.zip
```

The validator checks:

- `manifest.json` exists and matches the shared v2 schema,
- every `manifest.files[].path` exists in the ZIP,
- every listed file has matching `sha256` and `size`,
- package paths are relative and do not contain unsafe segments.

## Config Merge Rules

`menuEntries` are merged into `<Project>/TA/TAPython/UI/MenuConfig.json` at `OnToolBarChameleon.items` unless future manifest fields specify a different merge target.

`hotkeyEntries` are merged into `<Project>/TA/TAPython/UI/HotkeyConfig.json` under `Hotkeys`.

Installers MUST:

- preview entries before writing,
- skip exact duplicates,
- back up existing config files before writing,
- avoid deleting unrelated menu or hotkey entries.

## Runtime Roles

### TAPython Installer

- Exports project tools as v2 packages.
- Imports v2 packages through one shared install path.
- Downloads ToolHub packages and installs them through the same shared install path.
- Keeps compatibility importers for v1 `TAPythonProjectTool` and legacy ToolHub packages.

### ToolHub

- Accepts v2 packages for submission.
- Validates manifest, file hashes, path safety, and install metadata.
- Stores the original package as the download artifact.
- Generates website API/index/README/tool.md presentation data from the manifest.
- Exposes package SHA256 and install-plan endpoints for clients that still need them.
- During migration, the website API may keep its legacy `version.manifest` shape for existing UI and API clients while `/downloads/<slug>/<version>/manifest.json` and the ZIP package are v2.

Initial package upload endpoint:

```powershell
Invoke-WebRequest `
  -Method Post `
  -Uri "http://127.0.0.1:8787/api/submissions/package?submitter=<name>" `
  -ContentType "application/zip" `
  -InFile "<slug>-<version>.tapython-tool.zip"
```

The endpoint also accepts `application/octet-stream` and `x-submitter: <name>`. During migration, ToolHub converts the v2 package into the existing submission review model so the admin console can reuse the current pending-review flow.

### tapython-hub-publisher Skill

- Generates v2 packages from an existing project tool directory.
- Optionally emits `Docs/tool.md` and submission notes.
- Stops treating Markdown front matter as the install source of truth.

### Agent Installers

- Download package.
- Verify package SHA256 from ToolHub.
- Validate `manifest.json` and listed file hashes.
- Dry-run path writes and config merges.
- Ask for confirmation before writing.

## Backward Compatibility

Clients SHOULD normalize supported legacy sources into one internal descriptor:

```text
TAPythonProjectTool v1 package
Legacy ToolHub manifest + ZIP
TAPythonToolPackage v2
        ↓
ToolPackageDescriptor
        ↓
shared install / preview / backup / uninstall logic
```

Do not add new install behavior directly against legacy formats. Add a normalizer instead.

## Migration Priority

1. Publish this protocol and shared schema/type definitions.
2. Refactor TAPython Installer to install local packages and Hub packages through one normalized descriptor.
3. Upgrade TAPython Installer export to v2 while continuing to import v1.
4. Update ToolHub generation and downloads to emit v2 packages.
5. Update `tapython-hub-publisher` to generate v2 packages.
6. Add direct package upload from TAPython Installer to ToolHub.
