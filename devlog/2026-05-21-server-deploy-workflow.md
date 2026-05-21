# 2026-05-21 — 服务端部署脚本与本地/服务器工作流分离

## 背景

当前项目采用本地先行开发验证、推送远端仓库、服务器拉取部署的模式。10.2.13.8 服务器上曾由 Codex 运行或修改过文件，导致部署目录出现生成 JSON、lockfile 或源码的本地改动风险。

本次目标是把服务器定位为纯部署环境，避免它成为第二个开发工作区。

## 新增脚本

新增 `scripts/deploy-server.bat`，默认参数为：

```bat
scripts\deploy-server.bat radial-fork master 10.2.13.8 5174 8787 dual
```

也可以直接运行：

```bat
scripts\deploy-server.bat
```

脚本职责：

1. 检查当前仓库不是 UNC 路径。
2. 检查 `git`、`npm` 和目标 remote 是否可用。
3. 检查服务器 `.env` 存在。
4. 检查 `.env` 中存在 `ADMIN_USERNAME`、`ADMIN_PASSWORD_HASH`、`AUTH_SESSION_SECRET`。
5. `git fetch` 目标 remote。
6. `git reset --hard <remote>/<branch>` 强制对齐远端 tracked 文件。
7. `git clean -fd -e .env -e logs/ -e .tapython-tool-hub/` 清理未跟踪文件，同时保留服务器凭证、日志和运行数据。
8. `npm ci` 安装依赖。
9. 调用 `scripts/start-production.bat` 启动服务。

## 工作流边界

- 本地开发/验证：继续使用 `scripts/start-production.bat` 或 `npm run dev:api` + `npm run dev`。
- 服务端部署/更新：使用 `scripts/deploy-server.bat`。
- 服务端不直接开发，不保留 Codex 对 tracked 文件的修改。
- 如果服务端出现疑似有效修改，应先导出 patch 带回本地审查，而不是在服务端提交。

## 文档更新

`README.md` 和 `README_CN.md` 已补充本地启动脚本与服务端部署脚本的职责区别，以及 `deploy-server.bat` 的参数和风险提示。

## API 地址自动检测

前端 `apiBaseUrl` 调整为运行时按浏览器主机名判断：

- `localhost` / `127.*` / `::1` 访问时，API 指向 `http://127.0.0.1:8787`。
- 通过服务器 IP 访问 Vite dev/preview 端口时，API 指向同一主机的 `:8787`。
- 非 dev/preview 端口保持使用页面 `origin`，用于 single 模式静态服务。

`start-production.bat` 构建时传入 `VITE_API_BASE_URL=auto`，避免把本地 IP 或服务器 IP 写死到构建产物中。只有当前端页面和 API 不在同一台主机时，才需要显式设置 `VITE_API_BASE_URL`。