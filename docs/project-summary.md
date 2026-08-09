# Project self-summary

## Current objective

为“Gal 百宝箱”建立可嵌入更大项目的 Web 最小闭环，并用稳定 API 隔离 VNDB 与可替换前端。

## Confirmed facts

- 远端仓库：`https://github.com/Minyaako/gal-toolbox`，当前为 private。
- 默认分支：`main`。
- 公开 VN、角色和 staff 查询不需要 VNDB 登录。
- 已用真实 VNDB 数据验证：`v17 → s81 → character → VN`。
- 相同查询第二次返回 `X-Cache: HIT`。
- VNDB staff 没有人物图片；当前使用字形头像和角色立绘。
- VN 标题可优先选择 `zh-Hans/zh-Hant`；角色与 staff 只能可靠展示原文与罗马字。

## Decisions

- React + TypeScript Web，Fastify BFF，Node SQLite TTL 缓存。
- API 固定在 `/api/v1`，前端不使用 VNDB 原始结构。
- 名称优先级：简中 → 繁中 → 原文 → 罗马字。
- MVP 优先确定性关系探索，Tag/Trait 相似推荐延期。
- 图片按 VNDB 分级字段默认模糊，不建立永久图片镜像。
- UI 采用“视觉资料柜”方向；探索轨迹是首版标志性交互。

## Files/repos touched

- `apps/api/`：VNDB adapter、API routes、SQLite cache、错误映射与测试。
- `apps/web/`：搜索、VN/角色/staff 页面、分页、探索轨迹、响应式样式。
- `docs/mvp-spec.md`：用户行为与验收标准。
- `docs/api-contract.md`：可供未来前端重写使用的 DTO/接口契约。
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
- 未实现中文 Tag/Trait、相似推荐和全局关系图布局。
- 未生成 OpenAPI JSON；当前接口契约为 Markdown + TypeScript DTO。
- 未添加代码许可证文件。

## Next actions

1. 为 API 增加 OpenAPI schema 和 route integration tests。
2. 把探索轨迹升级为可折叠的关系图视图，但保持当前卡片视图。
3. 设计 Tag/Trait 本地化数据包接口，先不耦合具体翻译来源。
4. 确定大项目集成方式后再加入账号与个人数据层。

## Validation evidence

- `npm.cmd run typecheck`：通过。
- `npm.cmd test`：通过。
- `npm.cmd run build`：通过。
- `npm.cmd audit --audit-level=high`：0 vulnerabilities。
- Playwright：桌面/移动页面完成真实导航，最终控制台 0 errors。

