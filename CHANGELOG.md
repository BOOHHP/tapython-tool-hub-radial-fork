# Changelog

All notable changes for TAPython Tool Hub are documented here.

## 1.0.0 - 2026-05-02

### Added

- Web catalog for TAPython/Chameleon editor tools with search, filters, tool detail pages, version comparison, and install guidance.
- Fastify API for catalog JSON, downloadable manifests, Markdown, ZIP assets, install prompts, and submission workflow endpoints.
- Markdown-first tool publishing workflow with generated compatible API files and download packages.
- Submission workbench for new tools and new versions, including Markdown text import, Markdown file upload, referenced resource upload, validation details, and review actions.
- CLI package with `search`, `show`, `plan`, `download`, `verify`, `install`, `uninstall`, and `doctor` commands.
- CLI safety checks for hashes, path traversal, backups, rollback records, install ledger tracking, and structured `MenuConfig.json` merge.
- CLI CI/CD workflow that builds, tests, packages, and uploads Release artifacts to GitHub Releases.
- Manual test cases for publish, install, ZIP install, and UI optimization workflows.

### Changed

- Reworked the web UI into an Unreal/Fab-inspired dark marketplace experience.
- Simplified the header and added explicit return navigation for the submission page.
- Moved manifest copying into the detail panel and reduced duplicate card actions.
- Improved long value wrapping for manifest diffs, file hashes, validation messages, and tables.
- Weakened duplicate summary stats and improved tool card spacing for better scanning.

### Verified

- API build and focused workflow tests are expected to pass before tagging.
- CLI build and unit tests cover hash, zip, paths, MenuConfig, and ledger behavior.
- Web production build generates the static application bundle and compatible generated artifacts.

### Known Limitations

- PostgreSQL migration is manual through `apps/api/db/migrations/001_initial.sql`.
- NPM registry publication is not part of this release; CLI artifacts are distributed through GitHub Releases.
- Production authentication, hosted deployment automation, and multi-tenant governance are outside the 1.0.0 scope.
