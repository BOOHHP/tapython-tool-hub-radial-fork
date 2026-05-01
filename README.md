# TAPython Tool Hub

[中文说明](README_CN.md)

TAPython Tool Hub is a standalone sharing site for TAPython/Chameleon editor tools. It is designed to collect, search, distribute, and compare installable editor tool packages. The site shares tools, not Skills.

The current implementation is a hybrid web/API workspace. Tool records can still be maintained as Markdown documents with front matter or local JSON files, but the frontend now reads the catalog through a Fastify API. The backend serves compatible tool JSON, downloadable manifests/Markdown/assets, and a submission/review/publish workflow.

## Current Stage

The project has completed the initial frontend/backend migration through Phase G. It now runs as an npm workspace with `apps/web`, `apps/api`, `packages/shared`, and `packages/tooling`.

The backend is the preferred runtime entry point for catalog browsing, compatible JSON, downloads, and submissions. Generated static files are still kept as compatibility artifacts and can be served by the API or deployed statically when needed.

PostgreSQL is supported for submission/review storage when `DATABASE_URL` is configured. Without a database, the API falls back to local file storage for submissions so the workflow remains easy to try locally.

## Current Features

- Tool catalog home page with tool count, review status, version snapshots, and deployment mode.
- Search and filters by tool name, tags, author, Unreal API, widget Aka, category, risk level, and review status.
- Tool detail page with feature summary, compatibility, install path, mount point, dependencies, risk notes, and install steps.
- SkillHub-inspired detail page with selected-tool-only detail and version comparison flows.
- Manifest view with a structured table and raw JSON view for future Agent-based installation.
- Version comparison for manifest field diffs and file list/hash diffs.
- Submission and review workbench for Markdown-first tool submissions and referenced text assets.
- Backend validation through the shared tooling package before submissions enter review.
- Review approval flow that exports compatible API files, manifests, README, tool Markdown, and download assets.
- Backend-compatible API at `/api/tools/index.json` and `/api/tools/<tool>.json`.
- Backend-compatible downloads at `/downloads/<tool>/<version>/manifest.json`, `/README.md`, and `/tool.md`.

## Tech Stack

- Frontend: Vite + React + TypeScript
- UI: Ant Design
- Data source: `data/tool-docs/*.md` and `data/tools/*.json`
- Backend: Fastify + TypeScript
- Database: PostgreSQL for submissions/reviews when `DATABASE_URL` is configured; file fallback for local trials
- Shared contracts: Zod schemas and TypeScript DTOs in `packages/shared`
- Content processing: `packages/tooling`
- Workspace: npm workspaces with `apps/web`, `apps/api`, `packages/shared`, and `packages/tooling`
- Deployment: API-backed LAN deployment first, with static artifacts retained for compatibility

## Quick Start

```bash
npm install
npm run dev:api
npm run dev
```

Default development URLs:

```text
API: http://127.0.0.1:8787
Web: http://localhost:5174/ or the Vite-reported fallback port
```

The web app uses `VITE_API_BASE_URL` when set, otherwise it defaults to `http://127.0.0.1:8787`.

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

## Common Commands

| Command | Purpose |
|---------|---------|
| `npm run dev:api` | Build shared/tooling packages, then start the Fastify API in watch mode. |
| `npm run dev` | Build `packages/shared`, then start the Vite web app. |
| `npm run generate:data` | Regenerate compatible API/download artifacts from `data/`. |
| `npm run build` | Regenerate data and build the web app to `dist/`. |
| `npm run build:api` | Build `packages/shared`, `packages/tooling`, and `apps/api`. |
| `npm test -w @tapython-tool-hub/api` | Run focused API/workflow tests. |
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
│   │   │   └── downloads/       # Generated manifests, Markdown, README files, and assets
│   │   └── src/                 # Frontend UI, registry, styles, and types
│   └── api/                     # Fastify backend service and API routes
├── data/
│   ├── tools/                  # Source tool data, one JSON file per tool
│   └── tool-docs/              # Markdown-first tool documents and referenced assets
├── docs/                       # Implementation notes, API contracts, and follow-up notes
├── packages/
│   ├── shared/                 # Shared schema, DTO, manifest, and enum package
│   └── tooling/                # Markdown parsing, hashing, export, and diff package
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
4. Submissions are posted to `/api/submissions`, validated through `packages/tooling`, reviewed, and exported back to Markdown/source artifacts plus compatible generated outputs.

## API Surface

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | API and optional database health. |
| `GET` | `/api/tools` | Compatible tool index. |
| `GET` | `/api/tools/index.json` | Compatible tool index used by web and agents. |
| `GET` | `/api/tools/<slug>` | Compatible tool detail. |
| `GET` | `/api/tools/<slug>.json` | Compatible tool detail used by web and agents. |
| `GET` | `/downloads/*` | Compatible generated manifests, README, tool Markdown, and referenced assets. |
| `GET` | `/api/submissions` | List submissions. |
| `POST` | `/api/submissions` | Create and validate a Markdown-first submission. |
| `GET` | `/api/submissions/<id>` | Read one submission. |
| `POST` | `/api/submissions/<id>/review` | Approve, reject, or request changes. |

Submission and review routes are currently trusted-LAN oriented. Add authorization before exposing them outside a trusted network.

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
npm test -w @tapython-tool-hub/api
npm run build:api
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

Serve `dist/` with nginx or another static server and route API/download requests to `apps/api`, or configure `VITE_API_BASE_URL` to point at the API host.

Static-only deployment is still possible for catalog browsing if generated `public/api` and `public/downloads` artifacts are served directly, but submissions/reviews require the API.

Next recommended work is Phase H from the execution roadmap: database migration scripts, local PostgreSQL setup, route tests, PostgreSQL-first tool reads, and minimal authorization around review/publish actions.

## Known Gaps

- There is no migration runner yet; apply `apps/api/db/migrations/001_initial.sql` manually when using PostgreSQL.
- Tool reads are still backed by generated JSON artifacts; PostgreSQL-first tool reads are planned.
- Submission review/publish routes do not yet enforce authentication or authorization.
- Route-level tests for tools, downloads, health, and submission HTTP errors are still pending.
- The submission workbench is functional but should be split into smaller frontend components before it grows.

## Related Documents

- [tool-hub-plan.md](tool-hub-plan.md): Full site plan and phase roadmap.
- [docs/execution-roadmap.md](docs/execution-roadmap.md): Frontend/backend execution roadmap, target directory tree, package responsibilities, and migration sequence.
- [docs/implementation-notes.md](docs/implementation-notes.md): Current implementation notes and API details.
