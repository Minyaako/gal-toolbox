# Project self-summary

## Current objective

在 `Minyaako/gal-toolbox` 中交付并运营可嵌入更大项目的 Web 应用：以 VNDB
为数据源，用图片、中文优先名称、连续关系跳转和功能大厅完成 Gal 作品、角色、
声优与 Tag 的联想探索。

## Confirmed facts

- 仓库：`https://github.com/Minyaako/gal-toolbox.git`，默认分支为 `main`。
- 正式路由包括 `/`、`/knowledge`、四类 `/knowledge/*/:id` 详情、
  `/ranking`、`/settings` 与显式 404；旧详情链接保留重定向兼容。
- API 使用 `/api/v1` DTO 隔离 VNDB 原始结构，OpenAPI 3.1 位于
  `/api/v1/openapi.json`，文档页位于 `/api/docs`。
- 搜索、staff 角色和 Tag 作品列表每页 12 条；前端保持“一页显示、一页缓冲”，
  并使用 React Query、HTTP 与 SQLite TTL 缓存。
- 卡片、作品配音关系与 Tag 链接按偏好在导航意图发生时预取；节省流量模式只保留
  按下预取。
- 中文 Tag 来自 `JodieRuth/VNDB-Profile-Search`，英文原名继续保留用于定位。
- 首页装饰图标由 ImageGen 生成；品牌图与来源记录在
  `apps/web/public/asset-sources.md`。
- VN DTO 已有 `rating` 与 `voteCount` 字段；`/ranking` 当前仍是核心占位路由。
- 生产实例位于 `https://gtool.minyako.top`，由共享 Caddy 提供 HTTPS。
- 生产容器以非 root、只读根文件系统运行，只连接 `server_proxy`，不发布宿主机端口。
- SQLite 缓存每小时执行一次 `prune()`；过期 7 天以内的数据继续用于 `STALE` 回退。

## Decisions

- 采用 React + TypeScript SPA、Fastify BFF 与 Node SQLite TTL 缓存，前端不直接
  消费 VNDB 响应。
- `/` 为“Gal 百宝箱”功能大厅，VNDB 联想搜索位于 `/knowledge`；排行与设置是
  同级模块。
- 视觉方向为深海军蓝、莓红、湖蓝、墨绿与可访问香槟金组成的 Galgame 启动器；
  页面转场使用双层斜切色幕，并根据减少动态偏好降级。
- 搜索类型使用带 `legend` 的普通按钮组，不使用不完整的 tab/tablist 语义。
- 不把 React Query 数据持久化到浏览器存储；设置使用版本化本地存储。
- 图片按 VNDB 分级字段默认模糊，不建立永久图片镜像。
- 生产使用单实例 Node 容器、Docker Compose 和 SQLite 命名卷；发布保持手动，
  不添加 GitHub Actions。
- VNDB 网络错误统一映射为 502 `UPSTREAM_UNAVAILABLE`；存在近期过期缓存时返回
  `STALE` 数据。

## Files/repos touched

- `apps/web/src/app/`：应用壳、路由、设置、状态栏与转场。
- `apps/web/src/pages/`：大厅、联想搜索、四类详情、排行占位与设置页面。
- `apps/web/src/styles/` 与 `apps/web/src/styles.css`：视觉 token、应用壳、知识图鉴、
  响应式与无障碍样式。
- `apps/web/public/`：品牌、favicon 与 ImageGen 装饰资产。
- `apps/api/`：VNDB adapter、中文 Tag、本地/HTTP 缓存、OpenAPI、定时缓存维护与
  错误映射。
- `Dockerfile`、`compose.yml`、`deploy/gtool.caddy`：生产容器与 HTTPS 路由。
- `docs/deployment.md`：手动发布、验证和回滚步骤。
- `docs/verification/gtool-production-acceptance.md`：生产验收证据。

## Open questions

- 最终集成方式是独立服务、子路径模块还是 monorepo package。
- 排行的数据来源、时间范围、去重规则与排序模型尚未确定。
- 中文 Tag 的同步频率、人工纠错和上游错译反馈流程尚未确定。
- 如果未来需要多副本，何时迁移到共享缓存与共享限流。
- 仓库公开时间及项目许可证尚未确定。

## Risks

- VNDB 免费 API 面向非商业用途；商业化前必须重新确认授权和请求策略。
- Node 内置 SQLite 仍会输出实验性警告；多实例部署需要稳定驱动与共享限流/缓存。
- `character.seiyuu + vns` 表示关系集合，不能证明每个发行版本都由同一声优配音。
- VNDB 描述多为英文；中文 Tag 可能存在机器翻译误差，必须保留英文原名。
- 腾讯云到 VNDB/CDN 的连接可能瞬时超时或较慢；API 会返回 502 或使用可用的
  `STALE` 缓存。
- 首次图片访问仍受 VNDB CDN 和用户网络影响，当前没有图片代理或 Service Worker。

## Not done

- 未实现 VNDB 登录、收藏、评分、用户列表、Trait 中文化、相似推荐或完整关系图。
- Gal 排行未接入真实数据，不展示虚构名次。
- 未实现图片代理/CDN、Service Worker 或持久化图片缓存。
- 未添加项目代码许可证文件。

## Next actions

1. 在生产环境复验新版 `VN → 角色 → 声优 → 角色/作品` 与 `Tag → VN` 关系链。
2. 采集首次访问 LCP、图片下载耗时和预取命中率，再决定图片代理或 Service Worker。
3. 明确 Gal 排行规则后先写 API 契约与验收用例，再替换占位页。
4. 确定长期集成方式、许可证与中文 Tag 维护流程。

## Validation evidence

- 合并 PR #1 后：生成器 2/2、API 16/16、Web 43/43 通过；类型检查、生产构建与依赖审计通过。
- 生产：容器健康、HTTPS 首页与健康接口返回 200，真实 `v17` 查询成功且重复请求
  为 `X-Cache: HIT`。
- 香槟金 `#8a631f` 在卡片底色 `#fcfcf8` 上对比度为 5.26:1，满足 WCAG AA。
- Playwright 已覆盖桌面排行页、移动知识页、状态栏、全局搜索、按钮组和移动底栏语义。
- 生产浏览器烟测：大厅与知识图鉴加载正常，`v17` 显示“时空轮回”，控制台 0 error/0 warning。
