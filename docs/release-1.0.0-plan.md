# TAPython Tool Hub 1.0.0 Release Plan

## Goal

Release `v1.0.0` as the first stable milestone for the Tool Hub web/API/CLI workflow. The release should provide a usable tool catalog site, a reviewable submission workflow, generated downloadable tool packages, and CLI artifacts attached to GitHub Releases.

## Release Scope

### Included

- Web catalog for browsing, filtering, comparing, and inspecting TAPython tools.
- Fastify API for catalog data, downloads, install prompts, and submission/review operations.
- Markdown-first tool source workflow with generated compatible API and download artifacts.
- Submission workbench for new tools and new versions, including Markdown text/file input and resource upload.
- CLI commands for search, show, plan, download, verify, install, uninstall, and doctor checks.
- CLI release archives uploaded to GitHub Releases with `SHA256SUMS.txt`.
- Documentation for local development, production build, CLI usage, release workflow, and operations.

### Excluded From 1.0.0

- Public hosted deployment automation beyond buildable artifacts.
- NPM registry publication for private workspace packages.
- Full database migration runner; PostgreSQL migration remains manual through SQL files.
- Multi-tenant permissioning and production authentication.

## Milestones

### M0 - Release Freeze

Owner: maintainer

Exit criteria:

- `master` contains the intended release changes.
- No unrelated generated diffs are pending.
- Workspace package versions and internal workspace dependency ranges are aligned to `1.0.0`.
- Release tag naming is confirmed: use `v1.0.0` for the overall project release. Use `cli-v1.0.0` only if publishing a CLI-only patch outside a project release.

### M1 - Documentation Complete

Owner: maintainer

Exit criteria:

- README explains install channels, quick start, build/test commands, CLI commands, and Release artifacts.
- `CHANGELOG.md` has a `1.0.0` section with user-visible changes.
- This release plan is reviewed and linked from README.
- Manual test notes remain available under `manual-test-cases/`.

### M2 - Build And Test Gate

Owner: maintainer / CI

Commands:

```bash
npm install
npm run build:api
npm run build-cli
npm run test -w @tapython-tool-hub/api
npm run test -w @tapython-tool-hub/cli
npm run build
```

Exit criteria:

- API TypeScript build succeeds.
- CLI build succeeds.
- API tests pass.
- CLI tests pass.
- Web production build succeeds.
- Generated static API/download artifacts are present and expected.

### M3 - Release Artifact Gate

Owner: GitHub Actions

Trigger:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Exit criteria:

- `CLI CI/CD` workflow runs for the tag.
- GitHub Release `v1.0.0` exists.
- Release assets are attached:
  - `tapython-tool-hub-cli-<package-version>.tar.gz`
  - `tapython-tool-hub-cli-<package-version>.zip`
  - `SHA256SUMS.txt`
- Release notes are generated from commits and can be edited with the highlights from `CHANGELOG.md`.

## Release Upload Procedure

1. Confirm the workspace is clean except intentional release docs or version changes:

```bash
git status --short
```

2. Run the local release gate:

```bash
npm run build:api
npm run build-cli
npm run test -w @tapython-tool-hub/api
npm run test -w @tapython-tool-hub/cli
npm run build
```

3. Commit release documentation and any version bump:

```bash
git add README.md CHANGELOG.md docs/release-1.0.0-plan.md .github/workflows/cli-release.yml
git commit -m "Prepare 1.0.0 release"
```

4. Create and push the milestone tag:

```bash
git tag v1.0.0
git push origin master
git push origin v1.0.0
```

5. Wait for GitHub Actions to complete.

6. Open the GitHub Release and verify downloadable assets and checksums.

7. Edit the Release description with the 1.0.0 highlights from `CHANGELOG.md`.

## Rollback Plan

If the Release upload is incorrect:

1. Delete or mark the GitHub Release as draft.
2. Fix the workflow, package metadata, or docs.
3. Re-run the workflow manually with `release_tag=v1.0.0`, or create a patch tag such as `v1.0.1` if the public tag has already been consumed.

If CLI assets are wrong but the tag is correct:

1. Re-run `CLI CI/CD` manually with `release_tag=v1.0.0`.
2. The workflow uploads assets with `--clobber`, replacing the existing files.

## Post-release Checks

- Download the ZIP or tarball from GitHub Releases.
- Run `node dist/index.js --version` from the extracted archive.
- Run `tapython-tool-hub search actor --hub <release-hub-url>` after linking locally.
- Confirm the website detail page still shows AI, CLI, and ZIP installation paths.
- Create the next milestone notes for `1.0.1` or `1.1.0`.
