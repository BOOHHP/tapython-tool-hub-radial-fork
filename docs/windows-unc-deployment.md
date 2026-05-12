# Windows UNC Deployment Note

This repository must not be started on Windows directly from a UNC workspace path such as `\\server\share\tapython-tool-hub`.

## Why it fails

This repo is an npm workspace. On Windows, workspace packages under `node_modules/@tapython-tool-hub/*` are installed as junctions. In this environment those junctions resolve to server-local absolute paths such as `D:\Server\tapython-tool-hub\packages\shared`.

When the repo is opened from a UNC path on another machine, Node.js resolves the workspace package through that junction target. The client machine does not have the server's local `D:\Server\...` path, so module resolution fails before the API finishes booting.

Typical symptoms:

- `scripts\start-production.bat` prints `waiting for API to be ready...` and the API never becomes healthy.
- Direct API startup fails with an error similar to `ENOENT: no such file or directory, lstat 'D:\Server'`.
- Windows `cmd` may also print that UNC paths are not supported as the current directory.

## Supported ways to run

Use one of these patterns instead:

1. Run the repository on the Windows host machine from its local disk path, for example `D:\Server\tapython-tool-hub`.
2. Clone or copy the repository to a local disk on the client machine, run `npm install`, then start it locally.
3. Build and run the API/web processes on the host machine, and expose only the resulting HTTP endpoints to other LAN clients.

## Not supported

These patterns are not supported for Windows production startup:

- Opening the repo directly from `\\server\share\...` in VS Code and running `scripts\start-production.bat`.
- Reusing a `node_modules` tree created on the server from a different Windows machine through a file share.

## Operational guidance

- If you need a shared source of truth, share the Git remote or a deployment artifact, not a live `node_modules` directory over SMB.
- If a Windows operator reports that the API never passes the health check, first confirm whether the repo is being run from a UNC path.
- `scripts\start-production.bat` now fails fast on UNC paths so the operator sees the real cause immediately.