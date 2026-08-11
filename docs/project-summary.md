# Project self-summary

## Current objective

在 `Minyaako/gal-toolbox` 的 `dev` 分支持续交付 Gal 百宝箱 Web MVP。当前重点是让 VNDB 联想搜索在首次访问和并发操作时保持可响应，并保证分级图片控件在详情、列表与窄关系卡中均可操作。

## Confirmed facts

- 仓库：`https://github.com/Minyaako/gal-toolbox.git`；开发分支：`dev`；现有 PR：`dev -> main`。
- 前端为 React + TypeScript SPA，后端为 Fastify BFF；数据经 `/api/v1` DTO 隔离 VNDB 原始结构，并使用 React Query、HTTP 与 SQLite TTL 缓存。
- 正式路由包括 `/`、`/knowledge`、四类 `/knowledge/*/:id` 详情、`/ranking`、`/settings` 与 404；旧详情链接保留重定向。
- 搜索、Staff 角色和 Tag 作品列表每页 12 条；前端采用“显示一页、缓冲下一页”。
- VNDB 冷请求现由优先级调度器管理，而非等待上一请求完整结束的全局串行 Promise 链。
- 最终验证基于 HEAD `4758e8f`：Tag 2/2、API 29/29、Web 60/60，typecheck、production build 与 `git diff --check` 均通过。

## Decisions

- VNDB 调度维持最小启动间隔 1500ms、最大并发 2；优先级为 high/normal/low，同级 FIFO，并用约 8 秒 aging 防止饥饿。
- high 用于主动搜索、详情导航和显式下一页；normal 用于首屏关系和自动缓冲；low 用于 hover/focus/aggressive 预取。
- 同 key 请求共享上游任务；消费者可分别取消，只有最后消费者离开才中止底层请求。已处理 abort 后新消费者、settle 回调同 key 重入与旧 finally 清理竞态。
- React Query 的 AbortSignal 贯通到 BFF 和 VNDB fetch；AbortError 不重试。显式 high 分页提升也归页面生命周期信号管理。
- 自动缓冲后的新主动搜索会重新恢复 high，已由页面集成测试覆盖 `high -> normal -> high`。
- 分级图片按钮与导航链接为兄弟节点，不允许交互元素嵌套；层级为图片 z1、拉伸链接 z2、按钮 z3。
- 72–82px 的 cast/relation 小图显示短标签“显示”，保留完整 aria-label；普通网格继续显示“显示分级图片”。
- 不为满足“每任务一个提交”的形式要求改写已公开的审阅修复历史，保留独立修复提交便于追踪。

## Touched

- `apps/api/src/request-scheduler.ts` 与测试：优先级、并发、节流、aging、同 key 共享和取消。
- `apps/api/src/vndb.ts`、`app.ts`、`openapi.ts` 与测试：信号、优先级、Server-Timing、响应头和契约。
- `apps/web/src/api.ts`、`queries.ts`、`query-client.ts`、`buffered-pages.ts` 与测试：端到端 signal、retry、预取与分页提升。
- `apps/web/src/pages/SearchPage.tsx`、`StaffPage.tsx`、`TagPage.tsx`：主动请求与自动缓冲优先级。
- `apps/web/src/components.tsx`、`pages/VnPage.tsx`、相关样式与 happy-dom 测试：分级图片控件结构、层级与 compact 模式。
- `docs/superpowers/specs/2026-08-11-priority-cancellation-image-reveal-design.md` 与对应实施计划。

## Open questions

- Gal 排行的数据源、时间范围、去重规则与排序模型尚未确定。
- 生产部署继续使用单实例 SQLite，还是迁移到共享 Redis/PostgreSQL 缓存，尚未确定。
- 最终集成形态是独立服务、子路径模块还是 monorepo package，尚未确定。
- 中文 Tag 的同步频率、人工纠错与上游反馈流程尚未确定。

## Risks

- VNDB 上游仍可能波动；当前调度改善本地队头阻塞，但不能消除上游延迟。
- 1500ms 启动间隔和并发 2 是保守策略，生产流量增长后需结合 VNDB 限额、429 与 Server-Timing 数据调整。
- 首次图片访问仍受 VNDB CDN 和用户网络影响；尚无图片代理、Service Worker 或持久化图片缓存。
- Node 内置 SQLite 仍会输出实验性警告；多实例部署需要稳定驱动和共享限流/缓存。
- VNDB 免费 API 的授权与非商业使用边界需在商业化前重新确认。

## Not done

- 未实现登录、收藏、评分、用户列表、相似推荐或完整关系图布局。
- `/ranking` 仍为空白占位页。
- 未实现图片代理/CDN/Service Worker。
- 未重写或 squash 已产生的审阅修复提交。

## Next

1. 部署或重启本地 BFF 后，用 Server-Timing 持续采集冷启动 queue/upstream 数据，比较 Staff 分页与主动搜索的 P50/P95。
2. 根据实际 hover-to-click 命中率决定是否进一步限制低优先级预取预算。
3. 明确 Gal 排行规则后，先定义 API 契约与验收用例，再替换占位页。
4. 确定部署、许可证与中文 Tag 维护流程。
