# API Contract v1

Base path: `/api/v1`

API 使用稳定 DTO 隔离 VNDB Kana API。新增字段应保持向后兼容；破坏性修改通过 `/api/v2` 发布。

## Common types

```ts
type EntityType = "vn" | "character" | "staff" | "tag";

type EntityName = {
  primary: string;
  original: string | null;
  romanized: string | null;
  alternatives: string[];
};

type EntityImage = {
  url: string;
  thumbnailUrl: string | null;
  sexual: number;
  violence: number;
} | null;

type EntitySummary = {
  id: string;
  type: EntityType;
  name: EntityName;
  image: EntityImage;
};

type Page<T> = {
  items: T[];
  page: number;
  pageSize: number;
  more: boolean;
};
```

名称 `primary` 的选择顺序为：简体中文、繁体中文、原文、VNDB 罗马字显示名。

## Endpoints

### `GET /health`

返回服务状态和缓存可用性。

### `GET /search?type=vn|character|staff|tag&q=...&page=1&pageSize=12`

返回 `Page<EntitySummary>`。默认每页 12 条；`q` 长度为 1–120，`pageSize` 为 1–50。

### `GET /vns/:id`

返回：

- `entity: EntitySummary`
- `description`, `released`, `rating`, `voteCount`
- `relations: EntitySummary[]`
- `cast: { character: EntitySummary; staff: EntitySummary; note: string | null }[]`
- `tags: { tag: EntitySummary; rating: number; spoiler: number; category: string | null }[]`

### `GET /characters/:id`

返回角色资料以及：

- `appearances: { vn: EntitySummary; role: "main" | "primary" | "side" | "appears" }[]`

### `GET /staff/:id`

返回声优/制作人员资料、艺名和外部链接。VNDB 不提供 staff 图片。

### `GET /staff/:id/characters?page=1&pageSize=12`

返回声优配过的角色。每项中的 `appearances` 表示角色登场作品，不保证该声优为每个列出的版本配音。

### `GET /tags/:id`

返回 Tag 名称、说明、分类和关联作品数量。首版名称来自 VNDB 原始英文数据。

### `GET /tags/:id/vns?page=1&pageSize=12`

返回带有该 Tag 的作品，默认按 VNDB 评分降序排列。

### `GET /openapi.json`

返回 OpenAPI 3.1 机器可读文档。人类可读入口位于 `/api/docs`。

## Errors

```json
{
  "error": {
    "code": "UPSTREAM_RATE_LIMITED",
    "message": "VNDB 请求过于频繁，请稍后重试。",
    "requestId": "..."
  }
}
```

常见 code：`BAD_REQUEST`、`NOT_FOUND`、`UPSTREAM_RATE_LIMITED`、`UPSTREAM_UNAVAILABLE`、`INTERNAL_ERROR`。

响应可能包含 `X-Cache: HIT | MISS | STALE`，仅用于诊断，不属于业务逻辑。
