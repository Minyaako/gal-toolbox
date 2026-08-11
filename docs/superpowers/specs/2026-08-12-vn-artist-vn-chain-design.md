# VN → 画师 → VN 联想链路设计

## 目标

在现有 `VN → 角色 → 声优 → 角色/VN` 之外增加一条平行的 `VN → 画师 → VN` 链路。画师页使用独立路由，不改变现有声优页；首版只关联作品，不细分画师具体负责的角色。

数据继续来自 VNDB Kana API。官方 `/vn` 的 `staff` 字段提供 `role`、`note` 和 Staff 子字段；本功能只接受 `art`（原画／美术）和 `chardesign`（角色设计）。

## 路由

- `/knowledge/vn/:id`：新增“原画与角色设计”区块，画师链接进入 artist 路由。
- `/knowledge/artist/:id`：显示 Staff 基本资料及其画师作品列表。
- `/artist/:id`：保留参数、查询串和 hash，replace 重定向到 `/knowledge/artist/:id`。
- `/knowledge/staff/:id` 与 `/staff/:id` 保持现有配音链路，不根据来源切换内容。

页面标题和转场文案分别使用“画师图鉴”“正在准备画师资料”。artist 路由的详情 readiness 使用独立 React Query key `['artist', id]`。

## DTO 与接口

`EntitySummary.type` 继续保持 `staff`，不伪造 VNDB 实体类型。artist 语义由路由和关系 DTO 表达。

```ts
type ArtistRole = "art" | "chardesign";

type ArtistCredit = {
  role: ArtistRole;
  note: string | null;
};

type ArtistRelation = {
  staff: EntitySummary;
  credits: ArtistCredit[];
};

type ArtistWork = {
  vn: EntitySummary;
  credits: ArtistCredit[];
};
```

现有 `GET /api/v1/vns/:id` 的 `VnDetail` 增加 `artists: ArtistRelation[]`。

新增：

- `GET /api/v1/artists/:id`：返回与 Staff 详情相同的姓名、简介、语言、别名和外链结构。
- `GET /api/v1/artists/:id/vns?page=1&pageSize=12`：返回 `Page<ArtistWork>`，按 VNDB `rating` 降序。

artist 作品查询使用 VNDB `/vn` 的嵌套 `staff` 过滤器，限定 Staff ID 且 role 为 `art` 或 `chardesign`。返回字段同时包含 VN 摘要与 `staff{role,note,...}`，BFF 只保留目标 Staff 的两类画师 credit。

所有新接口沿用现有请求优先级、取消、Server-Timing、SQLite TTL 和 HTTP 缓存策略：详情 24 小时实体 TTL/300 秒 HTTP，关系页 12 小时关系 TTL/60 秒 HTTP。

## 合并与备注规则

- 同一个 Staff 在 VN 详情中只显示一次。
- 同一个 VN 在画师作品页只显示一次。
- 同一作品同时存在 `art` 与 `chardesign` 时合并到同一张卡，依次显示“原画／美术”“角色设计”。
- credit 按 `(role, cleanedNote)` 去重；空白 note 归一为 `null`。
- `staff.note` 使用现有 `cleanVndbText()` 清理后显示为该职责下的作品备注，不写入 Staff 的全局简介。

## 前端交互

VN 页在角色/声优区块之后增加画师区块；无画师数据时整个区块不渲染。无 Staff 图片时沿用姓名首字徽记，显示原文优先名称、罗马字辅助名、职责标签和非空备注。

画师页复用 Staff 页的资料头部和分页/缓冲体验，但关系区只显示“参与作品”。作品卡显示封面、标题、职责及备注，并链接回 `/knowledge/vn/:id`。无作品时显示明确空状态。

画师链接与作品链接保留 hover/focus 预取、pointerdown/click high priority 提升、取消和每页 12 条“一页显示、一页缓冲”。预取使用独立 `artistQuery` 和 `artistVnsQuery`，避免误写入声优关系缓存。

探索轨迹中的画师条目保存 artist 路径，不回落到 `/knowledge/staff/:id`；同一 Staff 的声优入口与画师入口视为不同上下文条目。

## OpenAPI 与兼容性

OpenAPI 版本升为 `1.3.0`，增加 `Artists` tag、两个路径以及 `ArtistCredit`、`ArtistRelation`、`ArtistWork`、`ArtistWorkPage` schema；`VnDetail.artists` 为 required 数组。API 文档补充 VN staff credit 与 `staff.note` 的含义。

已有客户端如果忽略新增 `artists` 字段不受影响。现有 Staff、角色、Tag、搜索 DTO 与路由均不改变。

## 测试与验收

- API 测试先验证 `/vns/:id` 将同一 Staff 的 `art`/`chardesign` 合并，并清理、保留各自 note。
- API 测试验证 `/artists/:id/vns` 的嵌套过滤器、分页、目标 Staff 筛选和同 VN 合并。
- OpenAPI 测试验证新增路径和 required schema。
- Web 测试验证 artist 路由、旧路由重定向、标题、转场 query key、VN 画师链接、画师页职责/备注和分页 scope。
- 全量 test、typecheck、production build 与 `git diff --check` 必须通过。
- 浏览器桌面与 390px 验收真实 `v17`：`s1928` 的 `art + chardesign` 合并为一个画师入口；`s223` 显示 note `Character sprites, BG`；进入画师页后能打开另一部 VN，控制台无错误且无横向溢出。

## 非目标

- 不增加 artist 搜索类型或修改全局 `EntityType`。
- 不把画师 credit 精确关联到具体角色。
- 不收录 scenario、director、music、songs、translator、editor、qa 或普通 staff 职责。
- 不新增图片代理、独立画师头像或新的缓存后端。
