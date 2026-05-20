# 2026-05-20 — 后台管理员 Cookie Session 登录

## 背景

项目已有后台管理控制台和 `/api/admin/*` 管理接口，但原模式默认信任访问者：前端直接显示后台入口，后端管理 API 没有认证边界，审核人也只是前端输入框文本。

本次目标是在不引入数据库强依赖的前提下，为本地试验项目和公盘服务器 `start-production.bat` 部署同时补齐单管理员登录保护。

## 后端认证边界

新增 `AuthService`，使用环境变量配置单管理员：

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD_HASH`
- `AUTH_SESSION_SECRET`
- `ADMIN_SESSION_TTL_HOURS`

密码哈希采用 `pbkdf2-sha256$iterations$salt$hash` 格式，不保存明文密码。登录成功后签发 HMAC 签名的 HttpOnly Cookie Session。

新增认证接口：

- `GET /api/auth/me`
- `POST /api/auth/login`
- `POST /api/auth/logout`

所有 `/api/admin/*` 路由统一挂 `requireAdmin`。未配置认证时返回 `503 admin_auth_not_configured`，未登录时返回 `401 admin_auth_required`。

## 审核人来源收口

审核接口仍兼容现有请求 schema，但后端会用当前 session 用户覆盖前端传入的 `reviewer` 字段。

这样审核记录中的审核人来自登录身份，不再信任浏览器输入。

## 前端后台登录

后台管理页进入时先请求 `/api/auth/me`：

- 未登录时只显示管理员登录表单
- 登录成功后显示当前管理员和退出按钮
- 管理数据轮询只在已登录状态下启动
- 所有 `/api/admin/*` fetch 均携带 `credentials: 'include'`

## 公盘服务器部署考虑

API 启动时会读取仓库根目录 `.env`，因此通过 `scripts/start-production.bat` 拉起的新 PowerShell 窗口也能拿到管理员配置，不依赖当前交互终端手工注入环境变量。

`dual` 模式下 Web 与 API 端口不同，后端 CORS 已开启 credentials，前端请求也带 cookie；`single` 模式下 API 服务静态前端，同样使用同一套 Cookie Session。

## 配置说明

`.env.example`、`README.md`、`README_CN.md` 已补充管理员变量和生成命令。

生成密码哈希示例：

```powershell
node -e "const crypto=require('node:crypto'); const p=process.argv[1]; const s=crypto.randomBytes(16).toString('base64url'); const i=210000; const h=crypto.pbkdf2Sync(p,s,i,32,'sha256').toString('base64url'); console.log(`pbkdf2-sha256$${i}$${s}$${h}`)" "你的管理员密码"
```

生成 Session 密钥示例：

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

## 验证计划

- API 测试覆盖未登录访问管理接口返回 `401`
- 正确管理员密码登录后可访问 `/api/admin/submissions`
- 错误密码登录返回 `401`
- 执行 API 构建、API 测试、Web 构建验证类型和前端集成