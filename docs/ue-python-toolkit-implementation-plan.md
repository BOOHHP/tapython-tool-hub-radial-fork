# Implementation Plan: UE Python Toolkit Collection

## Architecture Decisions

- Preserve the existing Shell execution model and recursive file-based loader.
- Install modules beneath the Shell root so no source module rewrite is required.
- Use JSON registry/state files and Python stdlib only; do not add YAML or parser dependencies.
- Separate scan, registry bootstrap, build, submit, and status operations.

## Phase 1: Foundation

### Task 1 — Scanner and dry-run report ✅

- Parse all `TOOL_META` values with Python AST/literal evaluation.
- Compute source SHA256 and classify new/changed/unchanged/missing.
- Verify source files are unchanged after scanning.
- Tests use temporary fixtures.

### Task 2 — Stable registry bootstrap ✅

- Generate unique candidate module IDs for missing IDs.
- Persist source path, module ID, slug, version, category, risk, and source hash.
- Refuse duplicate IDs and unsafe relative paths.

### Task 3 — Shell and module package builder ✅

- Build canonical v2 ZIPs in a caller-provided output directory.
- Build Shell package and three pilot module packages first.
- Validate manifests, hashes, ZIP paths, and deterministic output.

### Checkpoint A

- [x] Scanner reports 64 tools and 8 categories.
- [x] Registry contains 64 unique entries.
- [x] UNC source hashes unchanged.
- [x] Unit tests and package validation pass.
- [x] Freeze the 39 generated IDs as human-readable sourcePath overrides.
- [x] Mark approved pilot modules before publishing a Collection Lock.

## Phase 2: Hub Collection Contract

### Task 4 — Shared collection schema

- Add optional Collection metadata without adding a third `toolType`.
- Add collection index/detail API structures.

### Task 5 — Collection page

- One top-level Collection card.
- Category tree, module search, risk indicators, versions and pending updates.

### Checkpoint B

- Shell and pilot modules are visible as one Collection.
- Individual modules remain independently versioned.
- All 64 modules are approved. Shell `1.0.0` keeps its immutable three-module pilot lock snapshot; publish a coordinated Shell release before treating a lock as the current full-Collection pin.

## Phase 3: Installer Integration

### Task 6 — Collection install plan

- Shell dependency resolution.
- Per-module ledger entries and shared-root-safe uninstall.
- Install selected modules or pinned Collection Lock.

### Task 7 — Update and rollback

- Compare installed lock with latest approved lock.
- Update only changed modules.
- Roll back individual modules or the full Collection snapshot.

## Phase 4: Automated Sync

### Task 8 — Submit command

- Submit new/changed canonical packages as pending.
- Idempotent state records submission IDs and fingerprints.

### Task 9 — Scheduled execution

- Run periodic full scans under an account with SMB read permission.
- Emit concise sync report and alert on needs-input/error.
- Never run the task as an unauthenticated remote SYSTEM account.

## Known Risks

| Risk | Mitigation |
|------|------------|
| 39 tools lack stable IDs | Bootstrap deterministic candidates, then freeze registry |
| Source path rename appears as remove+add | Human remaps registry identity before submission |
| 35 destructive tools | Minimum medium risk; manual review for high-risk deletion/save behavior |
| Tkinter unavailable in some UE environments | Pre-install check; Chameleon Shell migration remains optional future work |
| SMB event loss | Scheduled full hash scan, not event watcher |
| Shared module root uninstall | File-level ledger; never remove parent root while other modules remain |
