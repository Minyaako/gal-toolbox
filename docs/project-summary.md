# Gal Toolbox project summary

## Current objective

在 `Minyaako/gal-toolbox` 中持续交付并运营 Gal 百宝箱 Web 应用。当前版本已经部署到生产环境，并通过优先级、取消与共享请求调度改善 VNDB 冷请求期间的交互响应，同时保证分级图片控件在详情、列表与窄关系卡中均可操作。

## Confirmed facts

- 画师作品列表与声优角色列表已统一为共享自适应网格；1500px 内容区自然形成六列，760px 以下两列，430px 以下一列。
- 已新增独立的 `VN → 画师 → VN` 探索链：VN 详情展示 `art` 与 `chardesign` 人员，画师详情使用 `/knowledge/artist/:id`，旧入口 `/artist/:id` 重定向到新路由。
- 同一画师在同一作品中的原画／美术、角色设计 credit 会合并为一张作品卡，但每条角色标签与 `staff.note` 都会保留；首版不映射到具体角色。
- BFF 已提供 `GET /api/v1/artists/:id` 与 `GET /api/v1/artists/:id/vns?page=...`，并在 VN 详情 DTO 中加入合并后的 `artists` 关系。

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
- 2026-08-11 实测慢角色详情的主要时间花在 BFF 调度队列：`queueWait` 约 8.0–8.7 秒，而 VNDB 上游约 0.38–1.05 秒；图片数量不是详情首屏的阻塞门槛。
- 旧实现中 hover 的 low 详情预取与路由 high 查询共享同一个 React Query pending promise，因此点击后不会向 BFF 发出 high 请求；12 秒上游超时再叠加两次前端重试时，最坏可接近 39 秒。

## Decisions

- 作品型卡片网格使用 `auto-fit + minmax(205px, 1fr)`，收起未使用轨道；VN 详情中的画师关系列表继续保持独立的桌面两列布局。
- 画师链与声优链保持平行路由和独立查询缓存，避免把“配音角色关系”与“作品画师关系”混入同一 staff 页面语义。
- 画师意图预取沿用全局 low-priority 三槽预算，点击时提升为 high；画师作品列表继续使用“一页展示、一页缓冲”和按 `artist:<id>` 分页 scope。
- QueryCache 状态栏订阅使用 React Query `notifyManager.batchCalls` 包装，防止冷画师路由注册查询时触发 React render-phase 更新警告。

- VNDB 调度维持最小启动间隔 1500ms、最大并发 2；优先级为 high/normal/low，同级 FIFO，并用约 8 秒 aging 防止饥饿。
- high 用于主动搜索、详情导航和显式下一页；normal 用于首屏关系和自动缓冲；low 用于 hover/focus/aggressive 预取。
- 同 key 请求共享上游任务；消费者可分别取消，只有最后消费者离开才中止底层请求。已处理 abort 后新消费者、settle 回调同 key 重入与旧 finally 清理竞态。
- React Query 的 AbortSignal 贯通到 BFF 和 VNDB fetch；AbortError 不重试。显式 high 分页提升也归页面生命周期信号管理。
- 自动缓冲后的新主动搜索会重新恢复 high，已由页面集成测试覆盖 `high -> normal -> high`。
- 自动翻页按 `pageScope + visiblePageCount` 去重：同一页进度只触发一次，进度推进或切换搜索/Staff/Tag scope 后可重新触发；已失效 IntersectionObserver 的迟到回调会被忽略。
- hover 预取延迟 150ms，离开卡片或卸载时取消；每个 QueryClient 最多同时保留 3 个不同实体的 low 意图预取，超额直接放弃。
- pointerdown/click 会额外发送一次 high 提升请求，不改变 React Query 的稳定 key。high 请求使用 `?_priorityPromotion=1` 区分 HTTP URL，避免浏览器或中间缓存把 low/high GET 合并；BFF 仍按同一 VNDB endpoint/body 键共享上游任务。
- VNDB 12 秒超时映射为 HTTP 504 `UPSTREAM_TIMEOUT`；前端对取消、429 和 504 不重试，其他错误最多重试一次。
- 分级图片按钮与导航链接为兄弟节点，不允许交互元素嵌套；层级为图片 z1、拉伸链接 z2、按钮 z3。
- 72–82px 的 cast/relation 小图显示短标签“显示”，保留完整 aria-label；普通网格继续显示“显示分级图片”。
- 不为满足“每任务一个提交”的形式要求改写已公开的审阅修复历史，保留独立修复提交便于追踪。
- 普通 VNDB 网络错误映射为 502 `UPSTREAM_UNAVAILABLE`；客户端取消与超时保持可辨别，非取消错误存在近期过期缓存时返回 `STALE` 数据。
- `/` 为“Gal 百宝箱”功能大厅，VNDB 联想搜索位于 `/knowledge`；排行与设置是同级模块。
- 生产使用单实例 Node 容器、Docker Compose 和 SQLite 命名卷；发布保持手动，不添加 GitHub Actions。
- 图片按 VNDB 分级字段默认模糊，不建立永久图片镜像。

## Files/repos touched

- `apps/web/src/styles/knowledge.css` 与 `apps/web/src/pages/ArtistPage.test.tsx`：画师作品／声优角色共享自适应网格及断点合同测试。
- `apps/api/src/app.ts`、`vndb.ts`、`openapi.ts` 与合同测试：画师详情/作品 API、VN 画师 credits 聚合、错误响应及 OpenAPI 1.3.0。
- `apps/web/src/pages/ArtistPage.tsx`、`VnPage.tsx`、`queries.ts`、`components.tsx`、路由与测试：画师链、预取/提升、轨迹和分页。
- `apps/web/src/app/AppShell.tsx`、`trail.tsx`、`styles/knowledge.css`：批处理缓存状态通知、严格轨迹缓存校验、画师卡片及长备注响应式布局。

- `apps/api/src/request-scheduler.ts` 与测试：优先级、并发、节流、aging、同 key 共享和取消。
- `apps/api/src/vndb.ts`、`app.ts`、`openapi.ts` 与测试：信号、优先级、错误映射、Server-Timing 和响应契约。
- `apps/api/src/cache-maintenance.ts` 与测试：每小时清理过期 SQLite 缓存。
- `apps/web/src/api.ts`、`queries.ts`、`query-client.ts`、`buffered-pages.ts` 与测试：端到端 signal、retry、预取与分页提升。
- `apps/web/src/components.tsx` 与测试：150ms 意图预取、三槽预算以及 pointerdown/click high 提升。
- `apps/web/src/pages/SearchPage.tsx`、`StaffPage.tsx`、`TagPage.tsx`：主动请求与自动缓冲优先级。
- `apps/web/src/components.tsx` 与上述三个分页页：自动加载按 scope/进度重新武装，并防止旧 observer 回调污染新页状态。
- `apps/web/src/components.tsx`、`pages/VnPage.tsx`、相关样式与 happy-dom 测试：分级图片控件结构、层级与 compact 模式。
- `Dockerfile`、`compose.yml`、`deploy/gtool.caddy`：生产容器与 HTTPS 路由。
- `docs/deployment.md` 与 `docs/verification/gtool-production-acceptance.md`：手动发布、回滚和生产验收。
- `docs/superpowers/specs/2026-08-11-priority-cancellation-image-reveal-design.md` 与对应实施计划。
- `docs/superpowers/specs/2026-08-11-detail-priority-prefetch-timeout-design.md` 与对应实施计划。

## Open questions

- Gal 排行的数据源、时间范围、去重规则与排序模型尚未确定。
- 最终集成方式是独立服务、子路径模块还是 monorepo package。
- 中文 Tag 的同步频率、人工纠错和上游反馈流程尚未确定。
- 如果未来需要多副本，何时迁移到共享缓存与共享限流。
- 仓库公开时间及项目许可证尚未确定。

## Risks

- VNDB 上游仍可能波动；当前调度改善本地队头阻塞，但不能消除上游延迟。
- 1500ms 启动间隔和并发 2 仍是保守策略；本轮没有修改这些参数，生产流量增长后需结合 VNDB 限额、429 与 Server-Timing 数据调整。
- 首次图片访问仍受 VNDB CDN 和用户网络影响；尚无图片代理、Service Worker 或持久化图片缓存。
- Node 内置 SQLite 仍会输出实验性警告；多实例部署需要稳定驱动与共享限流/缓存。
- VNDB 免费 API 面向非商业用途；商业化前必须重新确认授权和请求策略。

## Not done

- 画师链首版没有精确到“某画师负责某个角色”，也没有加入独立画师搜索入口；当前从 VN 作品关系进入画师页。

- 未实现登录、收藏、评分、用户列表、Trait 中文化、相似推荐或完整关系图布局。
- `/ranking` 仍为空白占位页，不展示虚构名次。
- 未实现图片代理/CDN、Service Worker 或持久化图片缓存。
- 未添加项目代码许可证文件。

## Next actions

1. 合并本轮画师链 PR 后在生产环境复验 `v17 → s1928 → v247`，确认真实 VNDB 数据、预取优先级、移动端换行和控制台均正常。
2. 部署合并后的版本并复验 `VN → 角色 → 声优 → 角色/作品` 与 `Tag → VN` 关系链。
3. 用 Server-Timing 采集冷启动 queue/upstream 数据，比较角色详情、主动搜索、Staff 分页与预取的 P50/P95。
4. 根据 hover-to-click 命中率评估 150ms 延迟和 3 槽 low 预算是否需要调整，并根据图片下载耗时决定是否引入图片代理。
5. 明确 Gal 排行规则后先写 API 契约与验收用例，再替换占位页。

## Validation evidence

- 自适应网格：Web 90/90、typecheck、production build 与最终独立审阅通过；真实浏览器在 1920px 声优页显示六列，760px 两列、390px 一列，画师页自动填充且各断点均无横向溢出或控制台错误。
- 画师链 API 与 Web 独立复审均通过；全仓测试 Tag 2/2、API 39/39、Web 89/89，根 typecheck、production build 与 `git diff --check` 通过。真实 `v17/s1928/v247` 数据完成桌面与 390px 验收：主内容/关系栏布局正确，`staff.note` 正常换行、无横向溢出，路由来回跳转正常，控制台 0 error/0 warning。

- PR #3 合并前开发分支基线：Tag 2/2、API 29/29、Web 60/60 通过。
- 本轮延迟修复合并远端部署分支前：Tag 2/2、API 31/31、Web 63/63，根 typecheck、production build、`git diff --check` 均通过；独立代码复审 PASS。
- 自动翻页修复：聚焦 23/23、Web 65/65，typecheck、production build 与两阶段代码复审通过。
- 上一生产版本：容器健康、HTTPS 首页与健康接口返回 200，真实 `v17` 查询成功且重复请求为 `X-Cache: HIT`。
- 生产浏览器烟测：大厅与知识图鉴加载正常，`v17` 显示“时空轮回”，控制台 0 error/0 warning。
