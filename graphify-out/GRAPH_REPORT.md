# Graph Report - /Users/radial/github/tapython-tool-hub  (2026-05-01)

## Corpus Check
- Corpus is ~27,258 words - fits in a single context window. You may not need a graph.

## Summary
- 268 nodes · 298 edges · 64 communities detected
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Download Build Pipeline|Download Build Pipeline]]
- [[_COMMUNITY_CLI Architecture Planning|CLI Architecture Planning]]
- [[_COMMUNITY_Actor Rename Package|Actor Rename Package]]
- [[_COMMUNITY_Actor Rename Controller|Actor Rename Controller]]
- [[_COMMUNITY_File Submission Repository|File Submission Repository]]
- [[_COMMUNITY_Submission Workflow Service|Submission Workflow Service]]
- [[_COMMUNITY_Postgres Submission Repository|Postgres Submission Repository]]
- [[_COMMUNITY_CLI HTTP Transport|CLI HTTP Transport]]
- [[_COMMUNITY_Install Ledger|Install Ledger]]
- [[_COMMUNITY_Install Command Flow|Install Command Flow]]
- [[_COMMUNITY_Selection Audit Tool|Selection Audit Tool]]
- [[_COMMUNITY_Static Tool Repository|Static Tool Repository]]
- [[_COMMUNITY_CLI Output Formatting|CLI Output Formatting]]
- [[_COMMUNITY_Web Tool Registry|Web Tool Registry]]
- [[_COMMUNITY_Menu Config Merge|Menu Config Merge]]
- [[_COMMUNITY_Filesystem Path Safety|Filesystem Path Safety]]
- [[_COMMUNITY_Download Routes|Download Routes]]
- [[_COMMUNITY_Submission Workflow Tests|Submission Workflow Tests]]
- [[_COMMUNITY_CLI Entry Point|CLI Entry Point]]
- [[_COMMUNITY_Hash Verification|Hash Verification]]
- [[_COMMUNITY_Uninstall Command|Uninstall Command]]
- [[_COMMUNITY_Shell Installer|Shell Installer]]
- [[_COMMUNITY_Manifest Diffing|Manifest Diffing]]
- [[_COMMUNITY_Submission Workbench UI|Submission Workbench UI]]
- [[_COMMUNITY_Web Submission Service|Web Submission Service]]
- [[_COMMUNITY_Zip Reader|Zip Reader]]
- [[_COMMUNITY_CLI Error Types|CLI Error Types]]
- [[_COMMUNITY_Download Command|Download Command]]
- [[_COMMUNITY_Plan Command|Plan Command]]
- [[_COMMUNITY_Database Client|Database Client]]
- [[_COMMUNITY_Backup Utility|Backup Utility]]
- [[_COMMUNITY_Ping Command|Ping Command]]
- [[_COMMUNITY_Verify Command|Verify Command]]
- [[_COMMUNITY_Search Command|Search Command]]
- [[_COMMUNITY_Show Command|Show Command]]
- [[_COMMUNITY_Web App Shell|Web App Shell]]
- [[_COMMUNITY_Tool Filters Hook|Tool Filters Hook]]
- [[_COMMUNITY_Tool Hub Page|Tool Hub Page]]
- [[_COMMUNITY_API App Factory|API App Factory]]
- [[_COMMUNITY_Environment Config|Environment Config]]
- [[_COMMUNITY_Submission Routes|Submission Routes]]
- [[_COMMUNITY_Download Route Tests|Download Route Tests]]
- [[_COMMUNITY_Tool Routes|Tool Routes]]
- [[_COMMUNITY_Health Routes|Health Routes]]
- [[_COMMUNITY_CLI Public Index|CLI Public Index]]
- [[_COMMUNITY_Shared Schemas|Shared Schemas]]
- [[_COMMUNITY_Shared Types|Shared Types]]
- [[_COMMUNITY_Tooling Public Index|Tooling Public Index]]
- [[_COMMUNITY_Ledger Tests|Ledger Tests]]
- [[_COMMUNITY_Hash Tests|Hash Tests]]
- [[_COMMUNITY_Zip Tests|Zip Tests]]
- [[_COMMUNITY_Path Tests|Path Tests]]
- [[_COMMUNITY_Menu Config Tests|Menu Config Tests]]
- [[_COMMUNITY_Actor Tool Package|Actor Tool Package]]
- [[_COMMUNITY_Vite Config|Vite Config]]
- [[_COMMUNITY_Tool Package Init|Tool Package Init]]
- [[_COMMUNITY_Tool Docs Init|Tool Docs Init]]
- [[_COMMUNITY_Python Package Init|Python Package Init]]
- [[_COMMUNITY_Web Main Entry|Web Main Entry]]
- [[_COMMUNITY_Web Types|Web Types]]
- [[_COMMUNITY_Display Helpers|Display Helpers]]
- [[_COMMUNITY_Registry Data|Registry Data]]
- [[_COMMUNITY_API Server Entry|API Server Entry]]
- [[_COMMUNITY_Submission Repository Interface|Submission Repository Interface]]

## God Nodes (most connected - your core abstractions)
1. `buildToolFromMarkdown()` - 10 edges
2. `ActorRenameController` - 9 edges
3. `generateToolData()` - 8 edges
4. `writeDownloads()` - 8 edges
5. `FileSubmissionRepository` - 8 edges
6. `PgSubmissionRepository` - 7 edges
7. `run()` - 6 edges
8. `TestSelectionAuditController` - 6 edges
9. `SubmissionWorkflow` - 6 edges
10. `Actor Rename Tool` - 6 edges

## Surprising Connections (you probably didn't know these)
- `Submission and Review Routes` --shares_data_with--> `PostgreSQL Submission Storage`  [INFERRED]
  docs/implementation-notes.md → README.md
- `Actor Rename Generated Downloads` --conceptually_related_to--> `Generated API and Download Artifacts`  [INFERRED]
  apps/web/public/downloads/actor-rename-tool/1.2.0/tool.md → tool-hub-plan.md
- `Test Selection Audit Generated Downloads` --conceptually_related_to--> `Generated API and Download Artifacts`  [INFERRED]
  apps/web/public/downloads/test-selection-audit-tool/0.2.0/tool.md → tool-hub-plan.md
- `Current Hybrid Stage` --conceptually_related_to--> `API-backed Hybrid Workspace`  [EXTRACTED]
  docs/implementation-notes.md → README.md
- `Single-repo Multi-app Architecture` --conceptually_related_to--> `API-backed Hybrid Workspace`  [EXTRACTED]
  docs/execution-roadmap.md → README.md

## Hyperedges (group relationships)
- **Three Install Channels** — readme_ai_assistant_install_prompt, readme_cli_install_channel, readme_zip_package_install_channel [EXTRACTED 1.00]
- **Markdown-first Generation Flow** — readme_markdown_first_tool_data, tool_hub_plan_external_file_reference, tool_hub_plan_manifest_data_model, tool_hub_plan_generated_artifacts [EXTRACTED 1.00]
- **Chameleon Tool Mount Pattern** — actor_rename_tool_actor_rename_tool, test_selection_audit_tool, actor_rename_tool_on_toolbar_chameleon_mount [INFERRED 0.84]

## Communities

### Community 0 - "Download Build Pipeline"
Cohesion: 0.13
Nodes (31): buildDownloads(), buildManifest(), buildReadme(), buildToolFromMarkdown(), crc32(), createZipArchive(), extractCodeAssets(), extractOrderedList() (+23 more)

### Community 1 - "CLI Architecture Planning"
Cohesion: 0.1
Nodes (22): Agent-friendly CLI JSON Output, CLI Default Safety Policy, Rationale from SkillHub Install Reference, Three Install Paths, Node TypeScript Unified Stack, Rationale for Repository Restructure, Single-repo Multi-app Architecture, Current Hybrid Stage (+14 more)

### Community 2 - "Actor Rename Package"
Cohesion: 0.15
Nodes (17): Actor Batch Rename, Actor Rename Tool, Actor Rename Generated Downloads, Actor Rename MenuConfig Merge, OnToolBarChameleon Mount, Actor Rename Risk Notes, Actor Tag Management, Compatible API Boundary (+9 more)

### Community 3 - "Actor Rename Controller"
Cohesion: 0.31
Nodes (1): ActorRenameController

### Community 4 - "File Submission Repository"
Cohesion: 0.31
Nodes (2): FileSubmissionRepository, isNotFoundError()

### Community 5 - "Submission Workflow Service"
Cohesion: 0.33
Nodes (4): resolveInside(), SubmissionWorkflow, versionAlreadyPublished(), writeSubmittedFiles()

### Community 6 - "Postgres Submission Repository"
Cohesion: 0.36
Nodes (1): PgSubmissionRepository

### Community 7 - "CLI HTTP Transport"
Cohesion: 0.43
Nodes (4): fetchBuffer(), fetchJson(), getTransport(), request()

### Community 8 - "Install Ledger"
Cohesion: 0.38
Nodes (3): getLedgerPath(), readLedger(), writeLedger()

### Community 9 - "Install Command Flow"
Cohesion: 0.52
Nodes (6): askConfirmation(), buildWarnings(), printInstallPlan(), resolveToolVersion(), rollback(), run()

### Community 10 - "Selection Audit Tool"
Cohesion: 0.38
Nodes (1): TestSelectionAuditController

### Community 11 - "Static Tool Repository"
Cohesion: 0.43
Nodes (2): isNotFoundError(), StaticToolRepository

### Community 12 - "CLI Output Formatting"
Cohesion: 0.53
Nodes (4): output(), printHuman(), printJson(), printTable()

### Community 13 - "Web Tool Registry"
Cohesion: 0.33
Nodes (0): 

### Community 14 - "Menu Config Merge"
Cohesion: 0.5
Nodes (2): applyMenuConfigMerge(), readMenuConfig()

### Community 15 - "Filesystem Path Safety"
Cohesion: 0.4
Nodes (0): 

### Community 16 - "Download Routes"
Cohesion: 0.4
Nodes (0): 

### Community 17 - "Submission Workflow Tests"
Cohesion: 0.6
Nodes (3): toDisplayName(), toPascalCase(), validSubmission()

### Community 18 - "CLI Entry Point"
Cohesion: 0.83
Nodes (3): buildContext(), main(), printUsage()

### Community 19 - "Hash Verification"
Cohesion: 0.67
Nodes (2): sha256Buffer(), sha256File()

### Community 20 - "Uninstall Command"
Cohesion: 0.83
Nodes (3): askConfirmation(), removeEmptyDirs(), run()

### Community 21 - "Shell Installer"
Cohesion: 0.5
Nodes (0): 

### Community 22 - "Manifest Diffing"
Cohesion: 0.5
Nodes (0): 

### Community 23 - "Submission Workbench UI"
Cohesion: 0.5
Nodes (0): 

### Community 24 - "Web Submission Service"
Cohesion: 0.5
Nodes (0): 

### Community 25 - "Zip Reader"
Cohesion: 1.0
Nodes (2): findEocd(), readZipEntries()

### Community 26 - "CLI Error Types"
Cohesion: 0.67
Nodes (1): CliError

### Community 27 - "Download Command"
Cohesion: 0.67
Nodes (0): 

### Community 28 - "Plan Command"
Cohesion: 1.0
Nodes (2): buildWarnings(), run()

### Community 29 - "Database Client"
Cohesion: 0.67
Nodes (0): 

### Community 30 - "Backup Utility"
Cohesion: 1.0
Nodes (0): 

### Community 31 - "Ping Command"
Cohesion: 1.0
Nodes (0): 

### Community 32 - "Verify Command"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "Search Command"
Cohesion: 1.0
Nodes (0): 

### Community 34 - "Show Command"
Cohesion: 1.0
Nodes (0): 

### Community 35 - "Web App Shell"
Cohesion: 1.0
Nodes (0): 

### Community 36 - "Tool Filters Hook"
Cohesion: 1.0
Nodes (0): 

### Community 37 - "Tool Hub Page"
Cohesion: 1.0
Nodes (0): 

### Community 38 - "API App Factory"
Cohesion: 1.0
Nodes (0): 

### Community 39 - "Environment Config"
Cohesion: 1.0
Nodes (0): 

### Community 40 - "Submission Routes"
Cohesion: 1.0
Nodes (0): 

### Community 41 - "Download Route Tests"
Cohesion: 1.0
Nodes (0): 

### Community 42 - "Tool Routes"
Cohesion: 1.0
Nodes (0): 

### Community 43 - "Health Routes"
Cohesion: 1.0
Nodes (0): 

### Community 44 - "CLI Public Index"
Cohesion: 1.0
Nodes (0): 

### Community 45 - "Shared Schemas"
Cohesion: 1.0
Nodes (0): 

### Community 46 - "Shared Types"
Cohesion: 1.0
Nodes (0): 

### Community 47 - "Tooling Public Index"
Cohesion: 1.0
Nodes (0): 

### Community 48 - "Ledger Tests"
Cohesion: 1.0
Nodes (0): 

### Community 49 - "Hash Tests"
Cohesion: 1.0
Nodes (0): 

### Community 50 - "Zip Tests"
Cohesion: 1.0
Nodes (0): 

### Community 51 - "Path Tests"
Cohesion: 1.0
Nodes (0): 

### Community 52 - "Menu Config Tests"
Cohesion: 1.0
Nodes (0): 

### Community 53 - "Actor Tool Package"
Cohesion: 1.0
Nodes (0): 

### Community 54 - "Vite Config"
Cohesion: 1.0
Nodes (0): 

### Community 55 - "Tool Package Init"
Cohesion: 1.0
Nodes (0): 

### Community 56 - "Tool Docs Init"
Cohesion: 1.0
Nodes (0): 

### Community 57 - "Python Package Init"
Cohesion: 1.0
Nodes (0): 

### Community 58 - "Web Main Entry"
Cohesion: 1.0
Nodes (0): 

### Community 59 - "Web Types"
Cohesion: 1.0
Nodes (0): 

### Community 60 - "Display Helpers"
Cohesion: 1.0
Nodes (0): 

### Community 61 - "Registry Data"
Cohesion: 1.0
Nodes (0): 

### Community 62 - "API Server Entry"
Cohesion: 1.0
Nodes (0): 

### Community 63 - "Submission Repository Interface"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **14 isolated node(s):** `File Fallback Submission Storage`, `Tool Package Standard`, `Rationale for Markdown-first Publishing`, `Agent-friendly CLI JSON Output`, `CLI Default Safety Policy` (+9 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Backup Utility`** (2 nodes): `backupFile()`, `backup.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Ping Command`** (2 nodes): `ping.ts`, `run()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Verify Command`** (2 nodes): `verify.ts`, `run()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Search Command`** (2 nodes): `search.ts`, `run()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Show Command`** (2 nodes): `show.ts`, `run()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Web App Shell`** (2 nodes): `App()`, `App.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Tool Filters Hook`** (2 nodes): `useToolFilters.ts`, `useToolFilters()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Tool Hub Page`** (2 nodes): `ToolHubPage.tsx`, `handleCopyPrompt()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `API App Factory`** (2 nodes): `createApp.ts`, `createApp()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Environment Config`** (2 nodes): `env.ts`, `loadConfig()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Submission Routes`** (2 nodes): `submissions.ts`, `registerSubmissionRoutes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Download Route Tests`** (2 nodes): `downloads.test.ts`, `createConfig()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Tool Routes`** (2 nodes): `tools.ts`, `registerToolRoutes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Health Routes`** (2 nodes): `health.ts`, `registerHealthRoutes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `CLI Public Index`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Shared Schemas`** (1 nodes): `schemas.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Shared Types`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Tooling Public Index`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Ledger Tests`** (1 nodes): `ledger.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Hash Tests`** (1 nodes): `hash.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Zip Tests`** (1 nodes): `zip.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Path Tests`** (1 nodes): `paths.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Menu Config Tests`** (1 nodes): `menuConfig.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Actor Tool Package`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vite Config`** (1 nodes): `vite.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Tool Package Init`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Tool Docs Init`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Python Package Init`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Web Main Entry`** (1 nodes): `main.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Web Types`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Display Helpers`** (1 nodes): `display.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Registry Data`** (1 nodes): `registry.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `API Server Entry`** (1 nodes): `server.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Submission Repository Interface`** (1 nodes): `submissionRepository.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `File Fallback Submission Storage`, `Tool Package Standard`, `Rationale for Markdown-first Publishing` to the rest of the system?**
  _14 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Download Build Pipeline` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._
- **Should `CLI Architecture Planning` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._