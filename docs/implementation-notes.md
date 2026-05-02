# Implementation Notes

## Current Scope

- API-backed frontend application.
- Compatible JSON/download artifacts with Markdown-first generation support.
- Fastify backend for catalog, downloads, health, submissions, reviews, and publish orchestration.
- PostgreSQL-backed submission/review repository when `DATABASE_URL` is configured, with file-system fallback for local trials.
- Tool catalog and tool detail pages.
- Selected-tool-only detail and version comparison navigation.
- Manifest display and basic manifest diff.
- Download links for Markdown, README, manifest, and referenced asset artifacts.
- Submission/review workbench for Markdown-first tool submissions and referenced text assets.

## Current Hybrid Stage

The current implementation is considered usable for API-backed LAN trials. Tool publication can still be handled by editing Markdown documents and referenced assets in git, but the preferred runtime path is now:

1. `apps/api` serves `/api/tools/*` and `/downloads/*` from generated compatibility artifacts.
2. `apps/web` loads tools through `VITE_API_BASE_URL` instead of static JSON imports.
3. `packages/tooling` is shared by the CLI and the backend publish flow.
4. Submissions are validated by the backend before review.
5. Approved submissions are exported back into `data/tool-docs/<slug>/` and generated API/download artifacts.

Operational model for source-maintained tools:

1. Add or update a tool document under `data/tool-docs/`.
2. Reference long UI JSON, Python, or MenuConfig files with `@file:` code blocks and explicit `path=` values.
3. Run `npm run build` to regenerate public API data and validate the site.
4. Review the git diff, then deploy the web build and API service.

Operational model for web submissions:

1. Run `npm run dev:api` and `npm run dev`.
2. Submit Markdown and referenced text files through the frontend workbench.
3. The API validates the submission with `packages/tooling`.
4. Reviewers approve or reject the submission.
5. Approval exports source Markdown and compatible generated artifacts.

This stage still intentionally keeps authentication, object storage, download statistics, and full admin role management out of scope. Review/publish actions are therefore suitable only for trusted LAN trials until minimal authorization is added.

## Markdown-first Source Model

Tool documents can now be maintained under `data/tool-docs/*.md`. Each Markdown file uses front matter for structured metadata and a normal Markdown body for human-readable documentation. The generator parses the document and produces the same JSON shape as the original hand-authored `data/tools/*.json` records.

Supported source modes:

- `markdown-inline`: MenuConfig, Chameleon UI JSON, and Python controller are embedded directly in the Markdown file.
- `markdown-with-external-files`: Markdown references long UI/Python/MenuConfig files with `@file:` code blocks.

Generated artifacts include:

```text
apps/web/public/api/tools/index.json        -> served as /api/tools/index.json
apps/web/public/api/tools/<tool>.json       -> served as /api/tools/<tool>.json
apps/web/public/downloads/<tool>/<version>/manifest.json
apps/web/public/downloads/<tool>/<version>/README.md
apps/web/public/downloads/<tool>/<version>/tool.md
apps/web/public/downloads/<tool>/<version>/<referenced asset files>
```

The backend consumes generated JSON/download artifacts and exposes them through compatible routes. Users and agents can still open the generated Markdown directly.

For external file references, the code fence must include either `path=<install-relative-path>` or an `@file:` reference. The generator reads referenced files only from the Markdown document directory and writes generated assets only inside the matching download directory.

## Deferred Scope

- Database migration runner and local PostgreSQL bootstrap.
- PostgreSQL-first Tool repository with static JSON fallback.
- Fastify route tests for tools, downloads, submissions, and health.
- Login, permissions, or a minimal internal review token.
- Download statistics.
- Database-backed version snapshots.
- UE editor one-click installer.

## API Surface

The API exposes stable compatibility routes:

```text
/api/tools/index.json
/api/tools/<tool>.json
/downloads/<tool>/<version>/manifest.json
/downloads/<tool>/<version>/README.md
/downloads/<tool>/<version>/tool.md
```

These routes are used by the frontend, Agent workflows, and future local installers.

Submission and review routes:

```text
/api/submissions
/api/submissions/<id>
/api/submissions/<id>/review
```

These routes are currently internal/trusted-LAN oriented. They need route tests and minimal authorization before being treated as production admin APIs.

## Current Recommendations

1. Add a migration runner under `scripts/migration` and document local PostgreSQL startup.
2. Add HTTP route tests for `/api/tools/*`, `/downloads/*`, `/api/submissions/*`, and `/health`.
3. Move tool reads toward PostgreSQL-first with static JSON fallback.
4. Add minimal authorization for review approval and publish actions.
5. Split the frontend submission workbench into smaller feature components before adding more admin UI.

## 2026-05-02 UI/UX Optimization Notes

Core operations completed in this pass:

1. Reworked the web app into a dark Unreal/Fab-style marketplace experience with a channel hero, global search, sidebar filters, shelf-like tool cards, and dark Ant Design component overrides.
2. Clarified the tool catalog card flow: cards now focus on browsing and opening details, while manifest inspection and copying live in the detail Manifest panel.
3. Improved detail and comparison views: Manifest file lists, full Manifest JSON, version comparison fields, file paths, and hashes now use wrapped monospace blocks/tables to avoid overflow.
4. Polished submission/review UX: new-tool vs new-version modes stay distinct, validation details wrap cleanly, and review action buttons have reliable dark-theme hover, focus, and disabled states.
5. Verified the pass with browser checks on the catalog, detail Manifest panel, version comparison, and submission review queue, plus TypeScript checks, production build, and whitespace validation.
