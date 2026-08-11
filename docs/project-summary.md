# Project self-summary

## Current objective

在 `Minyaako/gal-toolbox` 中交付可嵌入更大项目的 Web MVP：以 VNDB 为数据源，用图片、中文优先名称和连续关系跳转完成 Gal 作品、角色、声优与 Tag 的联想探索；所有开发落在 `dev` 分支。

## Confirmed facts

- 仓库：`https://github.com/Minyaako/gal-toolbox.git`；当前工作分支为 `dev`。
- 正式路由包括 `/`、`/knowledge`、四类 `/knowledge/*/:id` 详情、`/ranking`、`/settings` 与显式 404；旧详情链接保留重定向兼容。
- API 使用 `/api/v1` DTO 隔离 VNDB 原始结构，OpenAPI 3.1 位于 `/api/v1/openapi.json`，文档页位于 `/api/docs`。
- 搜索、staff 角色和 Tag 作品列表每页 12 条；前端保持“一页显示、一页缓冲”，并使用 React Query、HTTP 与 SQLite TTL 缓存。
- 卡片、作品配音关系与 Tag 关系链接会按偏好在 `pointerenter`、`focus`、`pointerdown` 时预取相同实体查询；节省流量模式只保留按下预取。
- 中文 Tag 来自 `JodieRuth/VNDB-Profile-Search`，英文原名继续保留用于定位。
- 首页装饰图标由 ImageGen 生成；用户截图已派生为 favicon 与多尺寸品牌图，来源和处理命令记录在 `apps/web/public/asset-sources.md`。
- VN DTO 已有 `rating` 与 `voteCount` 字段。`/ranking` 目前只是本项目的核心占位路由，不是 ReinaManager/Vnite 插件，也尚未确定相对队列或其他排名模型。

## Decisions

- 采用 React + TypeScript SPA、Fastify BFF 与 Node SQLite TTL 缓存，前端不直接消费 VNDB 响应。
- `/` 为“Gal 百宝箱”功能大厅，VNDB 联想搜索作为 `/knowledge` 下的第一个正式功能；排行与设置是同级模块。
- 视觉方向为深海军蓝、莓红、湖蓝、墨绿与可访问香槟金组成的华丽 Galgame 启动器；页面转场为约 500ms 双层斜切色幕。
- 系统减少动态偏好默认把转场降为约 120ms 淡出；用户可明确允许完整转场。装饰动画独立、局部降级。
- 搜索类型使用带 `legend` 的普通按钮组，不使用不完整的 tab/tablist 语义。
- 不把 React Query 数据持久化到 localStorage/IndexedDB；设置使用版本化本地存储，数据继续依赖意图预取和服务端缓存。

## Files/repos touched

- `apps/web/src/app/`：应用壳、路由、设置、状态栏与转场。
- `apps/web/src/pages/`：大厅、联想搜索、四类详情、排行占位与设置页面。
- `apps/web/src/styles/` 与 `apps/web/src/styles.css`：视觉 token、应用壳、知识图鉴、响应式与无障碍样式。
- `apps/web/public/`：品牌/favicon 与 ImageGen 装饰资产。
- `apps/api/`：VNDB adapter、中文 Tag、本地/HTTP 缓存、OpenAPI 与错误映射。
- `docs/`：MVP、API、性能/Tag/OpenAPI、华丽前端设计和实施计划。

## Open questions

- 最终集成方式是独立服务、子路径模块还是 monorepo package。
- 排行的数据来源、时间范围、去重规则与排序模型尚未确定。
- 中文 Tag 的同步频率、人工纠错和上游错译反馈流程尚未确定。
- 生产部署继续使用单实例 SQLite，还是迁移到共享 Redis/PostgreSQL 缓存。
- 仓库公开时间及项目许可证尚未确定。

## Risks

- VNDB 免费 API 面向非商业用途；商业化前必须重新确认授权和请求策略。
- Node 内置 SQLite 仍会输出实验性警告；多实例部署需要稳定驱动与共享限流/缓存。
- `character.seiyuu + vns` 表示关系集合，不能证明每个发行版本都由同一声优配音。
- VNDB 描述多为英文；VNDB Profile Search 的中文 Tag 可能存在机器翻译误差，必须持续保留英文原名。
- 首次图片访问仍受 VNDB CDN 和用户网络影响；当前只通过骨架、预取与缓存隐藏等待，没有图片代理或 Service Worker。

## Not done

- 未部署线上实例，未实现登录、收藏、评分、用户列表、Trait 中文化、相似推荐或完整关系图布局。
- Gal 排行未接入真实数据，不展示虚构名次。
- 未实现图片代理/CDN、Service Worker 或持久化图片缓存。
- 最终浏览器烟测未启动 BFF，因此没有在本轮重新验证完整 VNDB 实时关系链；全局搜索路由与错误状态已验证。此前真实链路结果只作为既有项目证据保留。
- 最终修复阶段未安装 ImageMagick，也没有重新切分图片；已提交资产保持不变，复现命令仍记录在来源文档中。

## Next actions

1. 启动 API 与 Web，重新跑一次真实 `VN → 角色 → 声优 → 角色/作品` 和 `Tag → VN` 浏览器链路。
2. 采集首次访问 LCP、图片下载耗时和 hover-to-click 命中率，再决定图片代理或 Service Worker。
3. 明确 Gal 排行规则后先写 API 契约与验收用例，再替换占位页。
4. 确定部署/集成方式、许可证与中文 Tag 维护流程。

## Validation evidence

- `npm.cmd test`：生成器 2/2、API 13/13、Web 43/43 通过。
- `npm.cmd run typecheck`：API 与 Web 通过。
- `npm.cmd run build`：Web Vite 生产构建与 API TypeScript 构建通过。
- `git diff --check`：通过。
- 香槟金 `#8a631f` 在卡片底色 `#fcfcf8` 上对比度为 5.26:1，满足 WCAG AA 普通文本要求。
- Playwright：1440×900 排行页与 390×844 知识页状态栏、全局搜索、普通按钮组和移动底栏语义正常；移动页面 `scrollWidth/clientWidth` 为 `390/390`。
- Playwright：全局搜索 `Ever17` 正确进入 `/knowledge?type=vn&q=Ever17`；排行初始页控制台 0 error/0 warning。搜索结果页因 API 未启动产生预期网络错误，并展示可重试错误状态。
- 浏览器截图保存在忽略目录 `.superpowers/sdd/2026-08-10-gal-treasure-box-frontend/task-4-evidence/`，不进入代码提交。
