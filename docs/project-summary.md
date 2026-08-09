# Project self-summary

## Current objective

为“Gal 百宝箱”建立可嵌入更大项目的 Web 最小闭环，并用稳定 API 隔离 VNDB 与可替换前端。

## Confirmed facts

- 远端仓库：`https://github.com/Minyaako/gal-toolbox`，当前为 private。
- 默认分支：`main`。
- 公开 VN、角色和 staff 查询不需要 VNDB 登录。
- 已用真实 VNDB 数据验证：`v17 → s81 → character → VN`。
- 已用真实 VNDB 数据验证：`Tag 搜索 → g19/g2380 → VN → VN Tag`。
- 相同查询第二次返回 `X-Cache: HIT`。
- VNDB staff 没有人物图片；当前使用字形头像和角色立绘。
- VN 标题可优先选择 `zh-Hans/zh-Hant`；角色与 staff 只能可靠展示原文与罗马字。
- OpenAPI 3.1 文档位于 `/api/v1/openapi.json`，轻量文档页位于 `/api/docs`。
- 搜索、staff 角色和 Tag 作品列表默认每页 12 条，并在距页尾 600px 时自动预取。

## Decisions

- React + TypeScript Web，Fastify BFF，Node SQLite TTL 缓存。
- API 固定在 `/api/v1`，前端不使用 VNDB 原始结构。
- 名称优先级：简中 → 繁中 → 原文 → 罗马字。
- MVP 优先确定性关系探索；已接入 VNDB Tag 搜索、VN→Tag 与 Tag→VN，Trait 和相似推荐仍延期。
- 图片按 VNDB 分级字段默认模糊，不建立永久图片镜像。
- UI 采用“视觉资料柜”方向；探索轨迹是首版标志性交互。
- 图片用固定比例骨架、淡入、失败占位和详情图高优先级改善加载观感；路由级请求使用完整资料加载场景。
- 中文 Tag 翻译本轮不接入，先保留 VNDB 英文原名，并为后续本地化层保留稳定 DTO。
- VN 详情仅展示 `spoiler === 0` 且非 `ero` 的 Tag。

## Files/repos touched

- `apps/api/`：VNDB adapter、API routes、Tag endpoints、OpenAPI 3.1、SQLite cache、错误映射与测试。
- `apps/web/`：搜索、VN/角色/staff/Tag 页面、自动预取、图片加载状态、探索轨迹、响应式样式。
- `docs/mvp-spec.md`：用户行为与验收标准。
- `docs/api-contract.md`：可供未来前端重写使用的 DTO/接口契约。
- `docs/performance-tags-openapi-spec.md`：本轮性能观感、Tag 与 OpenAPI 的范围和验收标准。
- `output/playwright/`：桌面与移动端真实页面截图。
- GitHub：`Minyaako/gal-toolbox`。

## Open questions

- 最终作为大项目的独立服务、子路径模块还是 monorepo package 集成。
- 仓库何时公开，以及项目代码最终采用 MIT、Apache-2.0 或其他许可证。
- 中文 Tag/Trait 使用 VNDB Profile Search 翻译、自己维护，还是仅显示英文原始值。
- 生产部署使用单实例 SQLite，还是 Redis/PostgreSQL 共享缓存。

## Risks

- VNDB API 免费条款面向非商业用途；商业化前必须确认授权。
- Node 内置 SQLite 在当前 Node 版本仍会打印实验性警告；生产化前应评估迁移到稳定驱动。
- `character.seiyuu + vns` 表示声优配过角色以及角色登场作品，不能证明每个发行版本都由该声优配音。
- VNDB 描述文本多为英文，中文内容不完整。
- 单实例节流器不适用于未来多副本部署，需要共享限流。

## Not done

- 未部署线上实例。
- 未实现 VNDB 登录、收藏、评分或用户列表。
- 未实现中文 Tag/Trait 翻译、Trait 探索、相似推荐和全局关系图布局。
- 未增加 Service Worker、图片代理/CDN 或持久化图片缓存。
- 未添加代码许可证文件。

## Next actions

1. 对比图片代理缩略图、Service Worker 缓存与 CDN 三种后续提速路径。
2. 设计 VNDB Profile Search 中文 Tag 数据适配层，并保留英文回退。
3. 把探索轨迹升级为可折叠的关系图视图，同时保留当前卡片视图。
4. 确定大项目集成方式后再加入账号与个人数据层。

## Validation evidence

- `npm.cmd run typecheck`：通过。
- `npm.cmd test`：通过。
- `npm.cmd run build`：通过。
- `npm.cmd audit --audit-level=high`：0 vulnerabilities。
- 真实 API：Tag 搜索、`g2380` 详情、Tag→VN 分页和 OpenAPI 3.1 均返回 200。
- Playwright：Tag→VN→Tag、自动追加分页、桌面加载场景和 390×844 移动布局通过，最终控制台 0 errors。
