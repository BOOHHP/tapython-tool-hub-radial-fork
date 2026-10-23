# 服务器数据基线（第 2 期数据迁移前）

记录时间：2026-10-23。迁移后任何数据对不上，都以本基线为准。

## 来源

- 服务器：10.2.13.8，代码目录 `D:\Server\tapython-tool-hub-radial-fork`
- 当时部署的代码提交：`9a07173`（已开启飞书登录与事件采集，业务数据尚在文件里）
- 完整数据副本（只读）：`\\10.2.13.8\Server\deploy-backups\tapython-tool-hub-radial-fork\baseline-pre-phase2-20261023\`
  - 含 `data/tool-docs`、`apps/web/public/downloads`、`apps/web/public/api/tools`、`.tapython-tool-hub/submissions`、`data/tools`
  - 该目录名不属于 deploy/daily 保留策略，不会被自动清理，请勿删除
- 逐文件 sha256 清单：本目录 `2026-10-23-server-inventory.json`（与副本内 `inventory.json` 相同）
- 生成命令：`node scripts/server/inventory.mjs --root <根目录> --out <文件>`
- 交叉校验：对服务器实时数据和副本各盘点一次，结果完全一致

## 数量与整体哈希

| 类别 | 文件数 | 字节数 | 整体 sha256（前 16 位） |
|---|---|---|---|
| `data/tool-docs` | 482 | 2,928,483 | `133412c4ffd6cde3` |
| `apps/web/public/api/tools` | 93 | 1,015,394 | `e838c00c877e6997` |
| `apps/web/public/downloads` | 840 | 9,179,172 | `5c62ac1f765f964b` |
| `.tapython-tool-hub/submissions` | 181 | 5,330,907 | `bf4574a75d7e5a31` |

整体 sha256 的算法：按相对路径排序后，对每行 `相对路径:文件sha256`（换行连接）再取 sha256。

## 业务口径

- 工具目录：91 个（`data/tool-docs` 下），`/api/tools` 返回 92 项
  - 多出的 1 项是 `test-selection-audit-tool`：它在 `data/tool-docs` 根目录下以单个 md 存在，没有同名目录
  - API 中有 3 个工具没有对应投稿：`selection-audit-script`、`test-selection-audit-tool`、`actor-rename-tool`（迁移时它们没有投稿来源，需要直接从工具文档导入）
  - 有 2 个投稿 slug 不在 `/api/tools` 中：`assetorganizer`、`asset-folder-tool`（迁移后同样不应出现在公开列表里）
- 投稿记录：94 条，91 个不同 slug
  - 状态：approved 91，draft 3，无 pending
  - 审核记录合计 113 条，评审人只有 `admin`（111）和 `TA Admin`（2）
- 提交人（自由文本）：Scene C Team 65，RADIAL 7，shiyu 6，junfeng 6，WuJunFeng 2，李露洁 2，yinxinyu 2，xiaojuan 1，吴俊枫 1，TA 1，CC 1
- 之前共识里的“26 个已发布 / 61 个 pending / 4 条 Collection”已过期，以本表为准

## 迁移后的核对要求

1. 投稿 94 条、审核记录 113 条、不同 slug 91 个，按 id 逐条一致
2. 制品文件逐个 sha256 与清单一致（downloads 840 个，投稿包 87 个）
3. `/api/tools` 与 `/api/tools/<slug>` 响应与迁移前一致（契约测试），总数仍为 92
4. 提交人原文逐条保留，不做改写
