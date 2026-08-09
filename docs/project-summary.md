# Project self-summary

## Current objective

为“Gal 百宝箱”建立可嵌入更大项目的 Web 最小闭环，并用稳定 API 隔离 VNDB 与可替换前端。

## Confirmed facts

- 远端仓库：`https://github.com/Minyaako/gal-toolbox`，当前为 private。
- 稳定分支：`main`；持续开发分支：`dev`，功能先在隔离 worktree 中完成验证。
- 公开 VN、角色和 staff 查询不需要 VNDB 登录。
- 已用真实 VNDB 数据验证：`v17 → s81 → character → VN`。
- 已用真实 VNDB 数据验证：`Tag 搜索 → g19/g2380 → VN → VN Tag`。
- 相同查询第二次返回 `X-Cache: HIT`。
- VNDB staff 没有人物图片；当前使用字形头像和角色立绘。
- VN 标题可优先选择 `zh-Hans/zh-Hant`；角色与 staff 只能可靠展示原文与罗马字。
- OpenAPI 3.1 文档位于 `/api/v1/openapi.json`，轻量文档页位于 `/api/docs`。
- 搜索、staff 角色和 Tag 作品列表默认每页 12 条；首屏静默准备第 2 页但只显示 12 条，揭示一页后继续准备后一页。
- 卡片在 `pointerenter`、`focus` 和 `pointerdown` 时预取目标详情；staff/Tag 同时预取首批关联列表。
- API 搜索/分页使用 60 秒 HTTP 缓存，详情使用 300 秒；React Query、HTTP、SQLite 与 VNDB CDN 组成四层缓存。
- Tag 简中翻译来自 `JodieRuth/VNDB-Profile-Search` 提交 `b5fe9b1d3e4712b460100d6ccccb2597f37524e6`，单独按 CC BY 4.0 使用。
- 中文 Tag 搜索走内置索引并返回 `X-Cache: LOCAL`；缺少翻译时逐条回退 VNDB 英文。

## Decisions

- React + TypeScript Web，Fastify BFF，Node SQLite TTL 缓存。
- API 固定在 `/api/v1`，前端不使用 VNDB 原始结构。
- 名称优先级：简中 → 繁中 → 原文 → 罗马字。
- MVP 优先确定性关系探索；已接入 VNDB Tag 搜索、VN→Tag 与 Tag→VN，Trait 和相似推荐仍延期。
- 图片按 VNDB 分级字段默认模糊，不建立永久图片镜像。
- UI 采用“视觉资料柜”方向；探索轨迹是首版标志性交互。
- 图片用固定比例骨架、淡入、失败占位和详情图高优先级改善加载观感；路由级请求使用完整资料加载场景。
- 中文 Tag 使用生成式 VNDB ID 映射接入：中文放在 `name.primary`，英文放在 `name.original`；同步命令为 `npm.cmd run sync:tag-translations`。
- 不把 React Query 数据持久化到 localStorage/IndexedDB；本轮通过意图预取和 HTTP 缓存改善首访与重复访问。
- VN 详情仅展示 `spoiler === 0` 且非 `ero` 的 Tag。

## Files/repos touched

- `apps/api/`：VNDB adapter、中文 Tag 映射/搜索、API routes、OpenAPI 3.1、HTTP/SQLite cache、错误映射与测试。
- `apps/web/`：共享 query options、意图预取、双页缓冲状态机、中文 Tag 展示、图片加载状态、探索轨迹与响应式样式。
- `scripts/`：VNDB Profile Search 翻译同步、校验、Base64 解码和稳定代码生成。
- `THIRD_PARTY_NOTICES.md`：VNDB 与中文 Tag 翻译来源、署名和许可证。
- `docs/mvp-spec.md`：用户行为与验收标准。
- `docs/api-contract.md`：可供未来前端重写使用的 DTO/接口契约。
- `docs/performance-tags-openapi-spec.md`：本轮性能观感、Tag 与 OpenAPI 的范围和验收标准。
- `output/playwright/`：桌面与移动端真实页面截图。
- GitHub：`Minyaako/gal-toolbox`。

## Open questions

- 最终作为大项目的独立服务、子路径模块还是 monorepo package 集成。
- 仓库何时公开，以及项目代码最终采用 MIT、Apache-2.0 或其他许可证。
- 中文 Tag 翻译的同步频率、人工校对和上游错译反馈流程。
- 生产部署使用单实例 SQLite，还是 Redis/PostgreSQL 共享缓存。

## Risks

- VNDB API 免费条款面向非商业用途；商业化前必须确认授权。
- Node 内置 SQLite 在当前 Node 版本仍会打印实验性警告；生产化前应评估迁移到稳定驱动。
- `character.seiyuu + vns` 表示声优配过角色以及角色登场作品，不能证明每个发行版本都由该声优配音。
- VNDB 描述文本多为英文，中文内容不完整。
- 单实例节流器不适用于未来多副本部署，需要共享限流。
- VNDB Profile Search 明确说明翻译由 ChatGPT 批量生成，可能存在错译；英文原名必须持续保留。

## Not done

- 未部署线上实例。
- 未实现 VNDB 登录、收藏、评分或用户列表。
- 未实现 Trait 中文化/探索、相似推荐和全局关系图布局。
- 未增加 Service Worker、图片代理/CDN 或持久化图片缓存。
- 未添加代码许可证文件。

## Next actions

1. 采集首次访问的 LCP、图片下载耗时和 hover→click 命中率，再决定图片代理或 Service Worker。
2. 为中文 Tag 同步增加定期更新与人工纠错流程。
3. 把探索轨迹升级为可折叠的关系图视图，同时保留当前卡片视图。
4. 确定大项目集成方式后再加入账号与个人数据层。

## Validation evidence

- `npm.cmd run typecheck`：通过。
- `npm.cmd test`：生成器 2 项、API 13 项、Web 9 项通过。
- `npm.cmd run build`：通过。
- `npm.cmd audit --audit-level=high`：0 vulnerabilities。
- 真实 API：中文“悬疑”搜索返回 `g19`，详情/分页缓存头为 300/60 秒，OpenAPI 版本为 1.2.0。
- Playwright：首屏请求第 1/2 页但 DOM 为 12 张卡；一次滚动后为 24 张并仅请求第 3 页。
- Playwright：hover 在点击前请求 Tag 详情与首批 VN，点击后未重复请求相同详情。
- Playwright：中文 Tag 搜索、VN 中文/英文 Tag 云和 390×844 移动布局通过，最终控制台 0 errors。
- 浏览器首次验收发现 IntersectionObserver 重渲染会连续揭示两页；增加离开触发区才能再次触发的锁存状态及回归测试后通过。
