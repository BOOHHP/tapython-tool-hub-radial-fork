# Graph Report - .  (2026-05-02)

## Corpus Check
- 148 files · ~15,054 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 537 nodes · 803 edges · 33 communities detected
- Extraction: 88% EXTRACTED · 11% INFERRED · 0% AMBIGUOUS · INFERRED: 92 edges (avg confidence: 0.79)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Run Ledger Print|Run Ledger Print]]
- [[_COMMUNITY_Submission Create Repository|Submission Create Repository]]
- [[_COMMUNITY_Command Run Unit|Command Run Unit]]
- [[_COMMUNITY_Write Build Extract|Write Build Extract]]
- [[_COMMUNITY_Actor Rename Controller|Actor Rename Controller]]
- [[_COMMUNITY_Actor Rename Markdown|Actor Rename Markdown]]
- [[_COMMUNITY_Audit Actor Rename|Audit Actor Rename]]
- [[_COMMUNITY_Tooling Shared Schemas|Tooling Shared Schemas]]
- [[_COMMUNITY_Actor Rename Widget|Actor Rename Widget]]
- [[_COMMUNITY_Submission Workflow Review|Submission Workflow Review]]
- [[_COMMUNITY_Submission Download Routes|Submission Download Routes]]
- [[_COMMUNITY_Actor Rename Json|Actor Rename Json]]
- [[_COMMUNITY_Cli Menu Http|Cli Menu Http]]
- [[_COMMUNITY_Actor Rename Execute|Actor Rename Execute]]
- [[_COMMUNITY_Actor Rename Execute|Actor Rename Execute]]
- [[_COMMUNITY_Actor Rename Execute|Actor Rename Execute]]
- [[_COMMUNITY_Submission Repository Constructor|Submission Repository Constructor]]
- [[_COMMUNITY_Install Tapython Windows|Install Tapython Windows]]
- [[_COMMUNITY_Artifact Manifest Json|Artifact Manifest Json]]
- [[_COMMUNITY_Ant Design Config|Ant Design Config]]
- [[_COMMUNITY_Submission Workbench Refresh|Submission Workbench Refresh]]
- [[_COMMUNITY_Front Back End|Front Back End]]
- [[_COMMUNITY_Artifact Generated Readme|Artifact Generated Readme]]
- [[_COMMUNITY_Ledger Cli Install|Ledger Cli Install]]
- [[_COMMUNITY_Output Cli Print|Output Cli Print]]
- [[_COMMUNITY_Cli Paths Install|Cli Paths Install]]
- [[_COMMUNITY_Ledger Cli Installed|Ledger Cli Installed]]
- [[_COMMUNITY_Artifact Cli Help|Artifact Cli Help]]
- [[_COMMUNITY_Search Command Run|Search Command Run]]
- [[_COMMUNITY_Cli Hash Sha|Cli Hash Sha]]
- [[_COMMUNITY_Cli Http Resolve|Cli Http Resolve]]
- [[_COMMUNITY_Cli Ledger Find|Cli Ledger Find]]
- [[_COMMUNITY_Tooling Validate Payload|Tooling Validate Payload]]

## God Nodes (most connected - your core abstractions)
1. `run()` - 27 edges
2. `ActorRenameController` - 14 edges
3. `output()` - 12 edges
4. `printHuman()` - 11 edges
5. `run()` - 11 edges
6. `run()` - 11 edges
7. `install command run` - 11 edges
8. `generateToolData()` - 10 edges
9. `buildToolFromMarkdown()` - 10 edges
10. `CLI install experiment` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Web Vite Build Configuration` --references--> `TAPython Tool Hub Overview`  [INFERRED]
  apps/web/vite.config.ts → README.md
- `Submission Workflow Validation and Publishing` --implements--> `Tool Hub Execution Model`  [INFERRED]
  apps/api/src/services/submissionWorkflow.ts → tool-hub-plan.md
- `Actor Rename Tool` --documents_tag_management_not_visible_in_controller--> `ActorRenameController`  [AMBIGUOUS]
  apps/web/public/downloads/actor-rename-tool/1.2.0/README.md → apps/web/public/downloads/actor-rename-tool/1.2.0/ActorRenameTool/ActorRenameTool.py
- `UI and tool optimization suggestions` ----> `InstallGuide`  [EXTRACTED]
  manual-test-cases/ui-tool-optimization-suggestions.md → apps/web/src/pages/ToolHubPage.tsx
- `Test Selection Audit Tool markdown` ----> `Tool Hub HTTP API`  [EXTRACTED]
  data/tool-docs/test-selection-audit-tool.md → apps/web/src/services/toolRegistry.ts

## Hyperedges (group relationships)
- **API Runtime Composition** — server_api_bootstrap, createapp_fastify_composition, env_api_config, client_database_pool_health, tools_routes_catalog_api, downloads_routes_static_downloads, submissions_routes_review_api, health_routes_database_status [EXTRACTED 0.94]
- **Submission Storage Strategies** — submissionrepository_contract, filesubmissionrepository_file_fallback, pgsubmissionrepository_postgres_storage, 001_initial_submission_schema [EXTRACTED 0.90]
- **Markdown Submission Publish Pipeline** — tool_hub_plan_execution_model, submissions_routes_review_api, submissionworkflow_validate_publish, statictoolrepository_generated_catalog_reader, downloads_routes_static_downloads, readme_actor_rename_package [INFERRED 0.84]
- **Actor Rename Tool release bundle** —  [EXTRACTED 0.95]
- **Test Selection Audit Tool release bundle** —  [EXTRACTED 0.94]
- **Web release workflow surface** —  [INFERRED 0.78]
- **InstallExperienceTriad** — InstallGuide, CliInstallationPlan, ToolZipPackage, MenuConfigMerge, ToolHubApi [INFERRED 0.88]
- **HybridPublishingArchitecture** — ExecutionRoadmap, ImplementationNotes, HybridApiBackedRuntime, MarkdownFirstToolSource, ToolHubApi [INFERRED 0.93]
- **ActorRenameReleaseValidationLoop** — ActorRenameToolDoc, ActorRenameExperiment, CliPublishExperiment, CliBuildLog, CliTestLog, CliVersionLog [INFERRED 0.95]
- **hyperedge:actor-rename-install-contract** — tool:actor-rename-tool, path:tapython-python-actorrenametool, path:tapython-ui-menuconfig, mount:OnToolBarChameleon, artifact:manifest-json [INFERRED 0.97]
- **hyperedge:rename-controller-flow** — class:ActorRenameController, method:ActorRenameController._get_selected_actors, method:ActorRenameController.refresh_actor_list, method:ActorRenameController.execute_find_replace, method:ActorRenameController.execute_batch_rename, api:actor.get_actor_label, api:actor.set_actor_label [INFERRED 0.94]
- **hyperedge:manual-release-validation** — workflow:manual-publish, concept:published-version-immutable, artifact:manifest-json, artifact:generated-readme, artifact:generated-tool-md, artifact:release-zip, hash:e5d531e07a00b5b6b1ed74fdbffd675d9998090aa8b2f1747d91db543648feb8 [INFERRED 0.96]
- **CLI installation pipeline** — cli-install-experiment, actor-rename-tool, actor-rename-manifest, actor-rename-package-zip, package-sha256-e5d531, tapython-python-actor-rename-path, menuconfig-json, tool-hub-installed-ledger, menuconfig-backup [INFERRED 0.98]
- **Manual ZIP installation pipeline** — manual-zip-install-experiment, actor-rename-package-zip, package-sha256-e5d531, actor-rename-manifest, tapython-python-actor-rename-path, menuconfig-json, on-toolbar-chameleon [INFERRED 0.98]
- **ActorRenameController runtime behavior** — actor-rename-controller, chameleon-data-binding, selected-level-actors, refresh-actor-list, execute-find-replace, execute-batch-rename, actor-labels, actor-tags [INFERRED 0.97]
- **hyperedge.install_lifecycle** — command.plan.run, command.install.run, package.sha256_verification, package.zip_entries, menu_config.merge_diff, install.ledger [INFERRED 0.86]
- **hyperedge.manual_zip_install_evidence** — manual.actor_rename_zip, manual.cli_verify_success, manual.menuconfig_valid, manual.installed_files, manual.installed_hashes [INFERRED 0.94]
- **hyperedge.cli_integrity_test_coverage** — test.hash, test.zip, test.paths, test.menu_config, test.ledger, package.sha256_verification, package.zip_entries, install.ledger [INFERRED 0.88]
- **hyperedge.toolDataGenerationPipeline** —  [INFERRED]
- **hyperedge.cliInstallSafetyPrimitives** —  [INFERRED]
- **hyperedge.sharedContractSurface** —  [INFERRED]

## Communities

### Community 0 - "Run Ledger Print"
Cohesion: 0.06
Nodes (51): run(), run(), askConfirmation(), buildWarnings(), printInstallPlan(), resolveToolVersion(), rollback(), run() (+43 more)

### Community 1 - "Submission Create Repository"
Cohesion: 0.07
Nodes (13): createApp(), createDatabasePool(), FileSubmissionRepository, isNotFoundError(), isNotFoundError(), StaticToolRepository, registerDownloadRoutes(), registerHealthRoutes() (+5 more)

### Community 2 - "Command Run Unit"
Cohesion: 0.09
Nodes (34): CLI command registry, CLI entrypoint, global --json flag, doctor command run, download command run, install command run, ping command run, plan command run (+26 more)

### Community 3 - "Write Build Extract"
Cohesion: 0.13
Nodes (31): buildDownloads(), buildManifest(), buildReadme(), buildToolFromMarkdown(), crc32(), createZipArchive(), extractCodeAssets(), extractOrderedList() (+23 more)

### Community 4 - "Actor Rename Controller"
Cohesion: 0.1
Nodes (24): ActorRenameController, ActorRenameController.execute_batch_rename(), ActorRenameController.execute_find_replace(), ActorRenameController.refresh_actor_list(), Actor Rename Tool, Actor Rename Tool 1.1.0 package, Actor Rename Tool 1.2.0 package, buildManifestDiff() (+16 more)

### Community 5 - "Actor Rename Markdown"
Cohesion: 0.12
Nodes (28): ActorRenameController, Actor Rename Tool experiment series, Actor Rename Tool markdown, Chameleon UI data bindings, CLI build log, Tool Hub CLI installation plan, CLI tool publish experiment, CLI test log (+20 more)

### Community 6 - "Audit Actor Rename"
Cohesion: 0.11
Nodes (4): ActorRenameController, ActorRenameController, TestSelectionAuditController, TestSelectionAuditController

### Community 7 - "Tooling Shared Schemas"
Cohesion: 0.1
Nodes (24): concept.downloadArtifact, concept.toolDataGeneration, script.generateData, shared.index.publicApi, shared.schemas.toolDetailResponseSchema, shared.schemas.toolIndexResponseSchema, shared.schemas.toolManifestSchema, shared.schemas.toolRecordSchema (+16 more)

### Community 8 - "Actor Rename Widget"
Cohesion: 0.12
Nodes (23): api:actor.get_actor_label, api:actor.set_actor_label, api:unreal.EditorLevelLibrary.get_selected_level_actors, api:unreal.PythonBPLib.get_chameleon_data, class:ActorRenameController, method:ActorRenameController.__init__, method:ActorRenameController._get_selected_actors, method:ActorRenameController.execute_batch_rename (+15 more)

### Community 9 - "Submission Workflow Review"
Cohesion: 0.12
Nodes (8): listSubmissions(), resolveInside(), SubmissionWorkflow, versionAlreadyPublished(), writeSubmittedFiles(), refresh(), review(), submit()

### Community 10 - "Submission Download Routes"
Cohesion: 0.13
Nodes (22): Submission and Tool PostgreSQL Schema, Database Pool and Health Check, Fastify Application Composition, Static Download Routes, Download Content Serving Tests, API Environment Configuration, File Submission Repository Fallback, Health Route Database Status (+14 more)

### Community 11 - "Actor Rename Json"
Cohesion: 0.17
Nodes (22): actor labels, ActorRenameController, manifest.json, actor-rename-tool-1.2.0.zip, Actor Rename Tool, actor tags, Chameleon data binding, CLI install experiment (+14 more)

### Community 12 - "Cli Menu Http"
Cohesion: 0.14
Nodes (17): cli.backup.backupFile, cli.hash.verifySha256, cli.http.fetchBuffer, cli.http.fetchJson, cli.http.getTransport, cli.http.request, cli.http.validateHubDomain, cli.menu.MenuConfigDiff (+9 more)

### Community 13 - "Actor Rename Execute"
Cohesion: 0.18
Nodes (1): ActorRenameController

### Community 14 - "Actor Rename Execute"
Cohesion: 0.52
Nodes (1): ActorRenameController

### Community 15 - "Actor Rename Execute"
Cohesion: 0.52
Nodes (1): ActorRenameController

### Community 17 - "Submission Repository Constructor"
Cohesion: 0.43
Nodes (1): PgSubmissionRepository

### Community 18 - "Install Tapython Windows"
Cohesion: 0.4
Nodes (6): tapython-tool-hub Windows CLI installer, Install-Standalone, Install-ViaNpm, Set-PathEntry, TTH_HUB_BASE, TTH_INSTALL_DIR

### Community 19 - "Artifact Manifest Json"
Cohesion: 0.4
Nodes (5): artifact:manifest-json, artifact:release-zip, concept:published-version-immutable, hash:e5d531e07a00b5b6b1ed74fdbffd675d9998090aa8b2f1747d91db543648feb8, workflow:manual-publish

### Community 22 - "Ant Design Config"
Cohesion: 0.5
Nodes (4): Ant Design ConfigProvider zh_CN theme, tool registry data barrel, ToolHubPage, Tool Hub Web App

### Community 23 - "Submission Workbench Refresh"
Cohesion: 0.5
Nodes (1): submission workflow API

### Community 24 - "Front Back End"
Cohesion: 0.67
Nodes (4): front/back-end execution roadmap, API-backed hybrid runtime, implementation notes, Markdown-first tool source model

### Community 25 - "Artifact Generated Readme"
Cohesion: 0.83
Nodes (4): artifact:generated-readme, artifact:generated-tool-md, artifact:source-markdown, workflow:cli-tool-publish

### Community 26 - "Ledger Cli Install"
Cohesion: 0.5
Nodes (4): cli.ledger.InstallLedger, cli.ledger.getLedgerPath, cli.ledger.readLedger, cli.ledger.writeLedger

### Community 27 - "Output Cli Print"
Cohesion: 0.5
Nodes (4): cli.output.output, cli.output.printHuman, cli.output.printJson, cli.output.printTable

### Community 28 - "Cli Paths Install"
Cohesion: 0.5
Nodes (4): cli.paths.checkFileWritable, cli.paths.detectTAPythonDir, cli.paths.expandInstallPath, cli.types.InstallPlan

### Community 30 - "Ledger Cli Installed"
Cohesion: 0.67
Nodes (3): cli.ledger.InstalledToolRecord, cli.ledger.addToolToLedger, cli.ledger.removeToolFromLedger

### Community 33 - "Artifact Cli Help"
Cohesion: 1.0
Nodes (2): artifact:cli-help, service:local-hub-8787

### Community 34 - "Search Command Run"
Cohesion: 1.0
Nodes (2): search command run, hub /api/tools/index.json endpoint

### Community 35 - "Cli Hash Sha"
Cohesion: 1.0
Nodes (2): cli.hash.sha256Buffer, cli.hash.sha256File

### Community 60 - "Cli Http Resolve"
Cohesion: 1.0
Nodes (1): cli.http.resolveUrl

### Community 61 - "Cli Ledger Find"
Cohesion: 1.0
Nodes (1): cli.ledger.findInstalledTool

### Community 62 - "Tooling Validate Payload"
Cohesion: 1.0
Nodes (1): tooling.validatePayload

## Ambiguous Edges - Review These
- `Actor Rename Tool` → `ActorRenameController`  [AMBIGUOUS]
  apps/web/public/downloads/actor-rename-tool/1.2.0/README.md · relation: documents_tag_management_not_visible_in_controller
- `SubmissionWorkbench` → `riskColor`  [AMBIGUOUS]
  apps/web/src/features/tools/display.ts · relation: shares_display_convention_with_tool_review_ui

## Knowledge Gaps
- **76 isolated node(s):** `TAPython Tool Hub Chinese Overview`, `Submission and Tool PostgreSQL Schema`, `Health Route Database Status`, `Submission Workflow Review Tests`, `Download Content Serving Tests` (+71 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Actor Rename Execute`** (15 nodes): `ActorRenameController`, `.execute_batch_rename()`, `.execute_find_replace()`, `._get_selected_actors()`, `.__init__()`, `.refresh_actor_list()`, `ActorRenameTool.py`, `ActorRenameTool.py`, `ActorRenameTool.py`, `ActorRenameTool.py`, `ActorRenameTool.py`, `ActorRenameTool.py`, `ActorRenameTool.py`, `ActorRenameTool.py`, `ActorRenameTool.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Actor Rename Execute`** (7 nodes): `ActorRenameTool.py`, `ActorRenameController`, `.execute_batch_rename()`, `.execute_find_replace()`, `._get_selected_actors()`, `.__init__()`, `.refresh_actor_list()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Actor Rename Execute`** (7 nodes): `ActorRenameController`, `.execute_batch_rename()`, `.execute_find_replace()`, `._get_selected_actors()`, `.__init__()`, `.refresh_actor_list()`, `ActorRenameTool.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Submission Repository Constructor`** (7 nodes): `PgSubmissionRepository`, `.constructor()`, `.create()`, `.get()`, `.list()`, `.save()`, `.toRecord()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Submission Workbench Refresh`** (4 nodes): `SubmissionWorkbench.refresh()`, `SubmissionWorkbench.review()`, `SubmissionWorkbench.submit()`, `submission workflow API`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Artifact Cli Help`** (2 nodes): `artifact:cli-help`, `service:local-hub-8787`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Search Command Run`** (2 nodes): `search command run`, `hub /api/tools/index.json endpoint`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cli Hash Sha`** (2 nodes): `cli.hash.sha256Buffer`, `cli.hash.sha256File`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cli Http Resolve`** (1 nodes): `cli.http.resolveUrl`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cli Ledger Find`** (1 nodes): `cli.ledger.findInstalledTool`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Tooling Validate Payload`** (1 nodes): `tooling.validatePayload`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Actor Rename Tool` and `ActorRenameController`?**
  _Edge tagged AMBIGUOUS (relation: documents_tag_management_not_visible_in_controller) - confidence is low._
- **What is the exact relationship between `SubmissionWorkbench` and `riskColor`?**
  _Edge tagged AMBIGUOUS (relation: shares_display_convention_with_tool_review_ui) - confidence is low._
- **Why does `run()` connect `Run Ledger Print` to `Submission Workflow Review`?**
  _High betweenness centrality (0.095) - this node is a cross-community bridge._
- **Why does `resolveInside()` connect `Submission Workflow Review` to `Run Ledger Print`?**
  _High betweenness centrality (0.090) - this node is a cross-community bridge._
- **Why does `FileSubmissionRepository` connect `Submission Create Repository` to `Audit Actor Rename`?**
  _High betweenness centrality (0.079) - this node is a cross-community bridge._
- **Are the 20 inferred relationships involving `run()` (e.g. with `printHuman()` and `output()`) actually correct?**
  _`run()` has 20 INFERRED edges - model-reasoned connections that need verification._
- **Are the 9 inferred relationships involving `output()` (e.g. with `run()` and `run()`) actually correct?**
  _`output()` has 9 INFERRED edges - model-reasoned connections that need verification._