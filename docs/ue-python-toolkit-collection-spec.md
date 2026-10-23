# Spec: UE Python Toolkit Collection

## Objective

将只读共享目录中的一个 Tkinter Python Shell 与 64 个分类纯 Python 脚本迁移到 TAPython Tool Hub，形成一个 Collection 产品。Shell 统一展示和执行模块；模块独立版本、安装、升级、卸载和回退。任何同步流程不得修改共享源目录。

## Source Boundary

- Source root: `\\10.2.13.252\Public2\2-项目交付\3-项目场景C\C\常用工具\UE_Python`
- Source is strictly read-only: never write, rename, move, delete, compile in place, or create `__pycache__`.
- Every scan records source file SHA256 before producing local artifacts.
- Generated files live under `integration/ue-python-toolkit/` or a caller-provided output directory.

## Product Model

- Collection ID: `ue-python-toolkit`
- Shell slug: `ue-python-toolkit`
- Module slug prefix: `uept-`
- Shell execution model: `toolType=python-script`, `uiKind=tkinter-shell`
- Module execution model: `toolType=python-script`, no direct MenuConfig entry by default
- Author: `场景C组`
- Owner team: `场景C组`

## Install Layout

```text
<Project>/TA/TAPython/Python/UEPythonToolkit/
├── __init__.py
├── runtime.py
├── collection.lock.json
└── Modules/
    └── <module-id>/
        ├── tool.py
        └── module.json
```

Shell command:

```python
import UEPythonToolkit
UEPythonToolkit.launch()
```

## Module Identity

- Prefer an existing literal `TOOL_META.id`.
- Otherwise allocate a deterministic candidate `tool-<sha1(relative-path)[:12]>` and persist it in `module-registry.json`.
- Registry identity is immutable after approval; source filename and display name may change without changing module ID.
- Initial module version is `1.0.0`.
- Source hash changes do not silently bump versions; dry-run reports the required action.

## Sync Behavior

- Full periodic scan, not SMB filesystem watching.
- AST parses `TOOL_META` without executing source code.
- New tools: candidate registry entry and pending action.
- Changed source hash: report `changed`; submission requires an explicit version bump.
- Missing source: report `missing`; never auto-delete or unpublish.
- Unchanged source: skip.
- Duplicate IDs, metadata parse failures, unsafe paths, unsupported parameter types, or source mutation: fail closed.

## Package Generation

- Shell package contains copied `runtime.py`, generated `__init__.py`, and `collection.lock.json`.
- Each module package contains copied `tool.py` and generated `module.json`.
- Packages follow TAPython Tool Package v2 and are validated before submission.
- Collection lock pins Shell and every approved module version.

## Testing Strategy

- Unit tests use local temporary fixture directories; tests never write to the UNC source.
- Scanner tests: metadata parsing, stable IDs, duplicate detection, new/changed/missing classification.
- Build tests: deterministic output, v2 manifest validity, hashes and ZIP layout.
- Real source dry-run: 64 tools, 8 categories, 0 metadata errors, source hashes unchanged.
- Pilot build: Shell plus three modules representing read-only, destructive, and complex parameter tools.

## Boundaries

### Always

- Generate into local workspace/temp directories.
- Submit only pending records.
- Keep module and Shell versions independent.
- Record source relative path and SHA256 in generated metadata.

### Ask First

- Approving submissions.
- Assigning or changing permanent module IDs.
- Major version changes.
- Deprecating missing source modules.

### Never

- Modify the UNC source.
- Auto-approve or auto-delete Hub tools.
- Package all 64 modules as one indivisible version.
- Treat Tkinter UI as a Chameleon tool.

## Success Criteria

- Scanner finds 64/64 modules and 8 top-level categories.
- Registry contains unique stable IDs and source hashes.
- Repeated dry-run produces identical output.
- One changed module does not change unrelated module packages or Shell version.
- Shell and pilot modules produce valid v2 packages.
- Source SHA256 values are identical before and after all operations.

## Deferred

- Hub Collection page and install-all UI.
- Installer Collection orchestration and dependency UX.
- Scheduled-task deployment under a service account with SMB read permission.
- Bulk submission after pilot approval.
