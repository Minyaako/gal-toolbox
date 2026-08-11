# Gal Toolbox project summary

## Current objective

在 `Minyaako/gal-toolbox` 中持续交付并运营 Gal 百宝箱 Web 应用。当前版本已经部署到生产环境，并通过优先级、取消与共享请求调度改善 VNDB 冷请求期间的交互响应，同时保证分级图片控件在详情、列表与窄关系卡中均可操作。

## Confirmed facts

- 仓库：`https://github.com/Minyaako/gal-toolbox.git`，默认分支为 `main`，开发分支为 `dev`。
- 前端为 React + TypeScript SPA，后端为 Fastify BFF；API 使用 `/api/v1` DTO 隔离 VNDB 原始结构。
- 正式路由包括 `/`、`/knowledge`、四类 `/knowledge/*/:id` 详情、`/ranking`、`/settings` 与显式 404；旧详情链接保留重定向。
- 搜索、Staff 角色和 Tag 作品列表每页 12 条；前端保持“一页显示、一页缓冲”，并使用 React Query、HTTP 与 SQLite TTL 缓存。
- VNDB 冷请求由优先级调度器管理；React Query 的 AbortSignal 贯通 BFF 与 VNDB fetch。
- 中文 Tag 来自 `JodieRuth/VNDB-Profile-Search`，英文原名继续保留用于定位。
- 生产实例位于 `https://gtool.minyako.top`，由共享 Caddy 提供 HTTPS。
- 生产容器以非 root、只读根文件系统运行，只连接 `server_proxy`，不发布宿主机端口。
- SQLite 缓存每小时执行一次 `prune()`；过期 7 天以内的数据可用于 `STALE` 回退。
- VN DTO 已有 `rating` 与 `voteCount` 字段；`/ranking` 当前仍是核心占位路由。

## Decisions

- VNDB 调度维持最小启动间隔 1500ms、最大并发 2；优先级为 high/normal/low，同级 FIFO，并用约 8 秒 aging 防止饥饿。
- high 用于主动搜索、详情导航和显式下一页；normal 用于首屏关系和自动缓冲；low 用于 hover、focus 与 aggressive 预取。
- 同 key 请求共享上游任务；消费者可分别取消，只有最后消费者离开才中止底层请求。
- 普通 VNDB 网络错误映射为 502 `UPSTREAM_UNAVAILABLE`；客户端取消与超时保持可辨别，非取消错误存在近期过期缓存时返回 `STALE` 数据。
- 分级图片按钮与导航链接为兄弟节点，不嵌套交互元素；窄关系图显示短标签“显示”，普通网格显示“显示分级图片”。
- `/` 为“Gal 百宝箱”功能大厅，VNDB 联想搜索位于 `/knowledge`；排行与设置是同级模块。
- 生产使用单实例 Node 容器、Docker Compose 和 SQLite 命名卷；发布保持手动，不添加 GitHub Actions。
- 图片按 VNDB 分级字段默认模糊，不建立永久图片镜像。

## Files/repos touched

- `apps/api/src/request-scheduler.ts` 与测试：优先级、并发、节流、aging、同 key 共享和取消。
- `apps/api/src/vndb.ts`、`app.ts`、`openapi.ts` 与测试：信号、优先级、错误映射、Server-Timing 和响应契约。
- `apps/api/src/cache-maintenance.ts` 与测试：每小时清理过期 SQLite 缓存。
- `apps/web/src/api.ts`、`queries.ts`、`query-client.ts`、`buffered-pages.ts` 与测试：端到端 signal、retry、预取与分页提升。
- `apps/web/src/pages/`、`components.tsx` 与相关样式：主动请求优先级、分级图片控件结构和 compact 模式。
- `Dockerfile`、`compose.yml`、`deploy/gtool.caddy`：生产容器与 HTTPS 路由。
- `docs/deployment.md` 与 `docs/verification/gtool-production-acceptance.md`：手动发布、回滚和生产验收。
- `docs/superpowers/specs/2026-08-11-priority-cancellation-image-reveal-design.md` 与对应实施计划。

## Open questions

- Gal 排行的数据源、时间范围、去重规则与排序模型尚未确定。
- 最终集成方式是独立服务、子路径模块还是 monorepo package。
- 中文 Tag 的同步频率、人工纠错和上游反馈流程尚未确定。
- 如果未来需要多副本，何时迁移到共享缓存与共享限流。
- 仓库公开时间及项目许可证尚未确定。

## Risks

- VNDB 上游仍可能波动；调度改善本地队头阻塞，但不能消除上游延迟。
- 1500ms 启动间隔和并发 2 是保守策略，生产流量增长后需结合 VNDB 限额、429 与 Server-Timing 数据调整。
- 首次图片访问仍受 VNDB CDN 和用户网络影响；尚无图片代理、Service Worker 或持久化图片缓存。
- Node 内置 SQLite 仍会输出实验性警告；多实例部署需要稳定驱动与共享限流/缓存。
- VNDB 免费 API 面向非商业用途；商业化前必须重新确认授权和请求策略。

## Not done

- 未实现登录、收藏、评分、用户列表、Trait 中文化、相似推荐或完整关系图布局。
- `/ranking` 仍为空白占位页，不展示虚构名次。
- 未实现图片代理/CDN、Service Worker 或持久化图片缓存。
- 未添加项目代码许可证文件。

## Next actions

1. 部署合并后的版本并复验 `VN → 角色 → 声优 → 角色/作品` 与 `Tag → VN` 关系链。
2. 用 Server-Timing 采集冷启动 queue/upstream 数据，比较主动搜索、Staff 分页与预取的 P50/P95。
3. 根据 hover-to-click 命中率和图片下载耗时决定是否进一步限制低优先级预取或引入图片代理。
4. 明确 Gal 排行规则后先写 API 契约与验收用例，再替换占位页。

## Validation evidence

- PR #3 合并前开发分支基线：Tag 2/2、API 29/29、Web 60/60 通过。
- 上一生产版本：容器健康、HTTPS 首页与健康接口返回 200，真实 `v17` 查询成功且重复请求为 `X-Cache: HIT`。
- 生产浏览器烟测：大厅与知识图鉴加载正常，`v17` 显示“时空轮回”，控制台 0 error/0 warning。
