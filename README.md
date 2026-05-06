# TAPython Tool Hub

[中文说明](README_CN.md)

TAPython Tool Hub is a standalone sharing site for TAPython/Chameleon editor tools. It is designed to collect, search, distribute, and compare installable editor tool packages. The site shares tools, not Skills.

The current implementation is a hybrid web/API workspace. Tool records can still be maintained as Markdown documents with front matter or local JSON files, but the frontend now reads the catalog through a Fastify API. The backend serves compatible tool JSON, downloadable manifests/Markdown/assets, and a submission/review/publish workflow.

## Current Stage

The project has completed the initial frontend/backend migration through Phase G and the full CLI installation plan (Phases 1–5). It now runs as an npm workspace with `apps/web`, `apps/api`, `packages/shared`, `packages/tooling`, and `packages/cli`.

The backend is the preferred runtime entry point for catalog browsing, compatible JSON, downloads, and submissions. Generated static files are still kept as compatibility artifacts and can be served by the API or deployed statically when needed.

PostgreSQL is supported for submission/review storage when `DATABASE_URL` is configured. Without a database, the API falls back to local file storage for submissions so the workflow remains easy to try locally.

## Installation Channels

The site provides three ways to install tools, designed for humans and AI assistants alike:

### 1. AI Assistant Prompt

Each tool detail page provides a copyable prompt. Paste it into any AI assistant (Copilot, Claude, Kimi, etc.) and the assistant will check the CLI, read the API, verify hashes, present an install plan, and wait for your confirmation before writing files.

### 2. CLI Terminal Install

```bash
# Install the CLI (macOS/Linux)
curl -fsSL https://<hub-domain>/install/cli.sh | bash -s -- --cli-only

# Install the CLI (Windows PowerShell)
irm https://<hub-domain>/install/cli.ps1 | iex

# Install a tool
tapython-tool-hub install <tool-slug> --hub https://<hub-domain> --project "<Project>"
```

The CLI defaults to showing an install plan and requiring confirmation. Use `--dry-run` for preview or `--yes` for unattended operation.

### 3. ZIP Package

Download the complete package (manifest + README + tool.md + all assets) for offline install, air-gapped environments, or manual auditing. The ZIP page shows sha256, size, and version.

## CLI Commands

```bash
tapython-tool-hub --version
tapython-tool-hub hub ping --hub <url>
tapython-tool-hub search <query> --hub <url>
tapython-tool-hub show <slug> --hub <url>
tapython-tool-hub plan <slug> --hub <url> --project <path>
tapython-tool-hub download <slug> --hub <url> --output <dir>
tapython-tool-hub verify --manifest <path> --package <path>
tapython-tool-hub install <slug> --hub <url> --project <path> [--dry-run] [--yes]
tapython-tool-hub uninstall <slug> --project <path>
```

All commands support `--json` for structured output, making them suitable for AI agent consumption.

## Current Features

- Tool catalog home page with tool count, review status, version snapshots, and deployment mode.
- Search and filters by tool name, tags, author, Unreal API, widget Aka, category, risk level, and review status.
- Tool detail page with feature summary, compatibility, install path, mount point, dependencies, risk notes, and install steps.
- Three-channel install guide: AI prompt, CLI commands (platform-detected), and ZIP with sha256/size.
- CLI package (`packages/cli`) with search, show, plan, download, verify, install, uninstall commands.
- Install safety: sha256 verification (package + per-file), path traversal prevention, backup before overwrite, rollback on failure, ledger tracking.
- Structural MenuConfig.json merge (JSON parse, not string concatenation).
- Version comparison for manifest field diffs and file list/hash diffs.
- Submission and review workbench for Markdown-first tool submissions and referenced text assets.
- Backend validation through the shared tooling package before submissions enter review.
- Review approval flow that exports compatible API files, manifests, README, tool Markdown, and download assets.
- Agent-friendly API endpoints: `/api/tools/:slug/install-prompt`, `/api/tools/:slug/versions/:version/install-plan-template`, `/api/tools/:slug/versions/:version/package.sha256`.
- ZIP metadata: `packageAvailable` flag with reason when unavailable, `packageSha256`, `packageSize`.

## Tech Stack

- Frontend: Vite + React + TypeScript
- UI: Ant Design
- Data source: `data/tool-docs/*.md` and `data/tools/*.json`
- Backend: Fastify + TypeScript
- CLI: Zero-dependency Node.js CLI (`packages/cli`) using only `node:*` modules + `@tapython-tool-hub/shared`
- Database: PostgreSQL for submissions/reviews when `DATABASE_URL` is configured; file fallback for local trials
- Shared contracts: Zod schemas and TypeScript DTOs in `packages/shared`
- Content processing: `packages/tooling`
- Workspace: npm workspaces with `apps/web`, `apps/api`, `packages/shared`, `packages/tooling`, and `packages/cli`
- Deployment: API-backed LAN deployment first, with static artifacts retained for compatibility

## Quick Start

```bash
npm install
npm run dev:api
npm run dev
```

To expose the Vite dev server to other devices on your LAN, start the web app with an explicit host:

```bash
npm run dev -w @tapython-tool-hub/web -- --host 0.0.0.0
```

Default development URLs:

```text
API: http://127.0.0.1:8787
Web: http://localhost:5174/ or the Vite-reported fallback port
```

The web app uses `VITE_API_BASE_URL` when set. Without it, Vite dev/preview falls back to the current page hostname on port `8787`, and other deployments fall back to the current site origin.

Production build:

```bash
npm run build
```

The build runs `npm run generate:data` first, generates static API files and downloadable Markdown/manifests/assets, then writes the production bundle to `dist/`.

API build and focused tests:

```bash
npm run build:api
npm test -w @tapython-tool-hub/api
```

CLI build and tests:

```bash
npm run build-cli
npm run test -w @tapython-tool-hub/cli
```

CLI release artifacts are produced by the `CLI CI/CD` GitHub Actions workflow. Pull requests build and test the CLI, while `master` pushes and tags run the packaging workflow. A `master` push uploads the archives as the workflow artifact `tapython-tool-hub-cli` for inspection only. Tags such as `v1.0.0` or `cli-v1.0.0` publish downloadable CLI archives to GitHub Releases:

- `tapython-tool-hub-cli-<version>.tar.gz`
- `tapython-tool-hub-cli-<version>.zip`
- `SHA256SUMS.txt`

The workflow can also be run manually with a `release_tag` input when a release needs to be republished. If a run finishes successfully but no files appear under GitHub Releases, check whether the run was started from `master` instead of a tag; in that case the files will be available under the workflow artifact rather than the Release page.

## 1.0.0 Release

The 1.0.0 milestone is tracked in [docs/release-1.0.0-plan.md](docs/release-1.0.0-plan.md), with user-facing changes summarized in [CHANGELOG.md](CHANGELOG.md). Before creating the release tag, run the local release gate:

```bash
npm run build:api
npm run build-cli
npm run test -w @tapython-tool-hub/api
npm run test -w @tapython-tool-hub/cli
npm run build
```

Create the milestone release by pushing the tag:

```bash
git tag v1.0.0
git push origin master
git push origin v1.0.0
```

The tag triggers the CLI CI/CD workflow and uploads the downloadable CLI archives plus `SHA256SUMS.txt` to GitHub Releases.

## Common Commands

| Command | Purpose |
|---------|---------|
| `npm run dev:api` | Build shared/tooling packages, then start the Fastify API in watch mode. |
| `npm run dev` | Build `packages/shared`, then start the Vite web app. |
| `npm run generate:data` | Regenerate compatible API/download artifacts from `data/`. |
| `npm run build` | Regenerate data and build the web app to `dist/`. |
| `npm run build:api` | Build `packages/shared`, `packages/tooling`, and `apps/api`. |
| `npm run build-cli` | Build `packages/shared` and `packages/cli`. |
| `npm test -w @tapython-tool-hub/api` | Run focused API/workflow tests. |
| `npm test -w @tapython-tool-hub/cli` | Run CLI unit tests (hash, zip, paths, menuConfig, ledger). |
| `npm run start:api` | Build API dependencies and start the compiled API service. |

## Configuration

The API reads configuration from environment variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `API_HOST` | `127.0.0.1` | Fastify listen host. |
| `API_PORT` | `8787` | Fastify listen port. |
| `DATABASE_URL` | unset | PostgreSQL connection string. When unset, submissions use file fallback. |
| `TOOL_DATA_ROOT` | `data/tools` | JSON source tool directory. |
| `TOOL_DOCS_ROOT` | `data/tool-docs` | Markdown-first source tool directory. |
| `TOOL_API_ROOT` | `apps/web/public/api/tools` | Compatible generated tool API root. |
| `TOOL_DOWNLOAD_ROOT` | `apps/web/public/downloads` | Compatible generated downloads root. |
| `SUBMISSION_ROOT` | `.tapython-tool-hub/submissions` | File fallback storage for submissions. |

The web app reads:

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_API_BASE_URL` | `http://127.0.0.1:8787` | Base URL used by the web app for API and download links. |

## Optional PostgreSQL

PostgreSQL is optional for local trials. Without `DATABASE_URL`, the submission workflow stores records under `.tapython-tool-hub/submissions`.

To use PostgreSQL, create a database, apply the initial schema, and start the API with `DATABASE_URL`:

```bash
createdb tapython_tool_hub
psql "$DATABASE_URL" -f apps/api/db/migrations/001_initial.sql
DATABASE_URL="postgres://localhost/tapython_tool_hub" npm run dev:api
```

The SQL migration is idempotent. A dedicated migration runner is planned for Phase H.

## Directory Structure

```text
.
├── apps/
│   ├── web/                    # Vite + React frontend application
│   │   ├── public/
│   │   │   ├── api/tools/       # Static tool API generated by the build script
│   │   │   ├── downloads/       # Generated manifests, Markdown, README, ZIP packages
│   │   │   └── install/         # CLI install scripts (cli.sh, cli.ps1)
│   │   └── src/                 # Frontend UI, registry, styles, and types
│   └── api/                     # Fastify backend service and API routes
├── data/
│   ├── tools/                  # Source tool data, one JSON file per tool
│   └── tool-docs/              # Markdown-first tool documents and referenced assets
├── docs/                       # Implementation notes, API contracts, and follow-up notes
├── packages/
│   ├── shared/                 # Shared schema, DTO, manifest, and enum package
│   ├── tooling/                # Markdown parsing, hashing, export, and diff package
│   └── cli/                    # tapython-tool-hub CLI (search, install, verify, uninstall)
├── scripts/
│   └── generate-data.mjs       # Generates apps/web/public/api and downloads from sources
├── tool-hub-plan.md            # Full execution plan
└── tsconfig.base.json          # Shared TypeScript base config
```

## Runtime Data Flow

1. The frontend calls the API at `VITE_API_BASE_URL`.
2. The API serves compatible catalog JSON from generated artifacts:
   - `/api/tools/index.json`
   - `/api/tools/<tool-slug>.json`
3. The API serves compatible downloads from the generated download root:
   - `/downloads/<tool-slug>/<version>/manifest.json`
   - `/downloads/<tool-slug>/<version>/README.md`
   - `/downloads/<tool-slug>/<version>/tool.md`
   - `/downloads/<tool-slug>/<version>/<tool-slug>-<version>.zip`
4. Submissions are posted to `/api/submissions`, validated through `packages/tooling`, reviewed, and exported back to Markdown/source artifacts plus compatible generated outputs.

## API Surface

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | API and optional database health. |
| `GET` | `/api/tools` | Compatible tool index. |
| `GET` | `/api/tools/index.json` | Compatible tool index used by web and agents. |
| `GET` | `/api/tools/<slug>` | Compatible tool detail. |
| `GET` | `/api/tools/<slug>.json` | Compatible tool detail used by web and agents. |
| `GET` | `/api/tools/<slug>/install-prompt` | Plain-text AI install prompt for a tool. |
| `GET` | `/api/tools/<slug>/versions/<ver>/install-plan-template` | Structured install plan (manifest, URLs, risk notes, CLI command). |
| `GET` | `/api/tools/<slug>/versions/<ver>/package.sha256` | Plain-text package sha256. |
| `GET` | `/downloads/*` | Compatible generated manifests, README, tool Markdown, ZIP packages, and assets. |
| `GET` | `/api/submissions` | List submissions. |
| `POST` | `/api/submissions` | Create and validate a Markdown-first submission. |
| `GET` | `/api/submissions/<id>` | Read one submission. |
| `POST` | `/api/submissions/<id>/review` | Approve, reject, or request changes. |

Submission and review routes are currently trusted-LAN oriented. Add authorization before exposing them outside a trusted network.

## CLI Operator Commands

Useful human/Agent workflows:

```bash
tapython-tool-hub doctor --hub http://127.0.0.1:8787 --project /path/to/UEProject
tapython-tool-hub plan actor-rename-tool --hub http://127.0.0.1:8787 --project /path/to/UEProject
tapython-tool-hub download actor-rename-tool --hub http://127.0.0.1:8787 --output ./audit-package
tapython-tool-hub install actor-rename-tool --hub http://127.0.0.1:8787 --project /path/to/UEProject --dry-run --report install-plan.json
tapython-tool-hub uninstall actor-rename-tool --project /path/to/UEProject
```

- `doctor` checks hub reachability, TAPython directory presence, MenuConfig writability, and CLI version.
- `plan` prints the install target, file actions, MenuConfig merge, warnings, and the next human step.
- `download` writes local manifest/ZIP files and reports the package sha256 verification result.
- `install --dry-run --report <file>` saves the install plan as JSON for audit or AI review.
- `uninstall` previews removed files, removed MenuConfig items, and the MenuConfig backup location before writing.

## CLI Safety Model

The CLI enforces these safety invariants:

1. Default mode is plan-only: no files are written until explicitly confirmed.
2. Actual write requires interactive confirmation or `--yes`.
3. Only writes to paths declared in the tool manifest (`installPath` + `menuConfigMerge.target`).
4. Verifies ZIP sha256 against API metadata before extraction.
5. Verifies each extracted file sha256 against manifest.
6. Creates `.bak` backups before overwriting existing files.
7. Maintains an install ledger at `<project>/TA/TAPython/.tool-hub/installed.json` for uninstall/rollback.
8. Rolls back all writes on failure (restores backups or deletes new files).
9. MenuConfig.json uses structural JSON merge, not string concatenation.
10. HTTP client restricts downloads to the specified hub domain.

## Submission Workflow

1. Open the web app and switch to the submission tab.
2. Paste a Markdown-first tool document with valid front matter.
3. Upload any text assets referenced by `@file:` code blocks, such as Chameleon UI JSON, Python controllers, or MenuConfig snippets.
4. Submit the draft. The API validates it through `packages/tooling`.
5. If validation passes, the submission enters `pending`; otherwise it is saved as `draft` with validation issues.
6. A reviewer approves or rejects the submission in the workbench.
7. Approval exports source files under `data/tool-docs/<slug>/` and regenerates compatible API/download artifacts.

Already published versions are immutable. A submission with the same slug and version as an existing release is rejected by validation.

## Source Data Flow

1. Maintain tool documents under `data/tool-docs/`, or keep compatibility JSON records under `data/tools/`.
2. Run `npm run generate:data`.
3. The script generates:
   - `apps/web/public/api/tools/index.json`
   - `apps/web/public/api/tools/<tool-slug>.json`
   - `apps/web/public/downloads/<tool-slug>/<version>/manifest.json`
   - `apps/web/public/downloads/<tool-slug>/<version>/README.md`
   - `apps/web/public/downloads/<tool-slug>/<version>/tool.md`
   - `apps/web/public/downloads/<tool-slug>/<version>/<tool-slug>-<version>.zip`
   - referenced UI JSON, Python, and MenuConfig files
4. The backend reads generated API/download artifacts and exposes them through stable compatible routes.

For the current hybrid stage, run both the API and web app in development. Static artifacts remain compatibility outputs and can still be deployed when a backend is not required.

## Tool Data Requirements

Each tool should describe at least:

- Basic metadata: `slug`, name, description, author, category, tags, risk level, and review status.
- Compatibility: Unreal Engine versions, TAPython version, and required plugins.
- Installation: install path, Chameleon mount point, and MenuConfig snippet.
- Versions: version number, release date, changelog, manifest, file list, and hashes.
- Risk notes: modified objects, pre-checks, post-checks, and rollback guidance.

The current Markdown-first sample tools are `Actor Rename Tool` and `Test Selection Audit Tool`, defined in `data/tool-docs/`.

## Testing And Validation

Before committing code changes, prefer running the smallest relevant checks first, then the full build:

```bash
npm test -w @tapython-tool-hub/cli
npm test -w @tapython-tool-hub/api
npm run build:api
npm run build-cli
npm run build
```

For dependency safety checks:

```bash
npm audit --omit=dev
```

The web build may warn about large chunks because Ant Design is included in the current bundle. That warning is expected for now; code splitting is a later UI optimization.

## Deployment

Preferred LAN deployment runs the API and web build together:

```bash
npm run build:api
npm run build
npm run start:api
```

On Windows you can launch a production-style build plus preview pair with `scripts\start-production.bat`:

```bat
scripts\start-production.bat 10.2.13.8 5174 8787
```

Arguments are `<public IP or hostname> <web port> <api port>`.

Serve `dist/` with nginx or another static server and route API/download requests to `apps/api`, or configure `VITE_API_BASE_URL` to point at the API host.

Static-only deployment is still possible for catalog browsing if generated `public/api` and `public/downloads` artifacts are served directly, but submissions/reviews require the API.

Next recommended work is Phase H from the execution roadmap: database migration scripts, local PostgreSQL setup, route tests, PostgreSQL-first tool reads, and minimal authorization around review/publish actions.

## Known Gaps

- There is no migration runner yet; apply `apps/api/db/migrations/001_initial.sql` manually when using PostgreSQL.
- Tool reads are still backed by generated JSON artifacts; PostgreSQL-first tool reads are planned.
- Submission review/publish routes do not yet enforce authentication or authorization.
- Route-level tests for tools, downloads, health, and submission HTTP errors are still pending.
- The submission workbench is functional but should be split into smaller frontend components before it grows.
- CLI is currently `private: true`; npm publish setup is needed for public distribution.

## Related Documents

- [tool-hub-plan.md](tool-hub-plan.md): Full site plan and phase roadmap.
- [docs/cli-installation-plan.md](docs/cli-installation-plan.md): CLI design, install channels, and implementation phases.
- [docs/execution-roadmap.md](docs/execution-roadmap.md): Frontend/backend execution roadmap, target directory tree, package responsibilities, and migration sequence.
- [docs/implementation-notes.md](docs/implementation-notes.md): Current implementation notes and API details.
