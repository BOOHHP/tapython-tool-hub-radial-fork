# Implementation Notes

## MVP Scope

- Static frontend application.
- Static JSON data source with Markdown-first generation support.
- Tool catalog and tool detail pages.
- Selected-tool-only detail and version comparison navigation.
- Manifest display and basic manifest diff.
- Download links for Markdown, README, ZIP, and manifest artifacts.

## Basic Usable Static Stage

The current implementation is considered usable for static maintenance. Tool publication is handled by editing Markdown documents and referenced assets in git, then running `npm run generate:data` or `npm run build`. Generated API files are committed for the static frontend registry, while downloadable tool Markdown/manifests/assets are produced under `public/downloads/` during generation and deployment builds.

Operational model:

1. Add or update a tool document under `data/tool-docs/`.
2. Reference long UI JSON, Python, or MenuConfig files with `@file:` code blocks and explicit `path=` values.
3. Run `npm run build` to regenerate public API data and validate the site.
4. Review the git diff, then deploy `dist/` to nginx or another static server.

This stage intentionally avoids online upload, login, database state, and server-side review workflows.

## Markdown-first Source Model

Tool documents can now be maintained under `data/tool-docs/*.md`. Each Markdown file uses front matter for structured metadata and a normal Markdown body for human-readable documentation. The generator parses the document and produces the same JSON shape as the original hand-authored `data/tools/*.json` records.

Supported source modes:

- `markdown-inline`: MenuConfig, Chameleon UI JSON, and Python controller are embedded directly in the Markdown file.
- `markdown-with-external-files`: Markdown references long UI/Python/MenuConfig files with `@file:` code blocks.

Generated artifacts include:

```text
/api/tools/index.json
/api/tools/<tool>.json
/downloads/<tool>/<version>/manifest.json
/downloads/<tool>/<version>/README.md
/downloads/<tool>/<version>/tool.md
/downloads/<tool>/<version>/<referenced asset files>
```

The frontend continues to consume generated JSON, while users and agents can open the generated Markdown directly.

For external file references, the code fence must include either `path=<install-relative-path>` or an `@file:` reference. The generator reads referenced files only from the Markdown document directory and writes generated assets only inside the matching download directory.

## Deferred Scope

- Login and permissions.
- Online upload and review workflow.
- Download statistics.
- Database-backed version snapshots.
- UE editor one-click installer.

## API Surface

The MVP should expose stable static JSON routes after build:

```text
/api/tools/index.json
/api/tools/<tool>.json
```

These routes are used by the frontend, Agent workflows, and future local installers.

Markdown-first tools may also expose:

```text
/downloads/<tool>/<version>/tool.md
```

This file is the exported Markdown document and can be used by Agent workflows that prefer direct natural-language installation instructions.
