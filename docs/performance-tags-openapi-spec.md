# 性能观感、Tag 与 OpenAPI 增量规格

## Feature

隐藏不可避免的网络等待，并把 Tag 纳入联想探索链，同时发布机器可读接口契约。

## User goal

用户点击实体后立即看到稳定、明确的加载反馈；浏览一页结果时下一页已在后台准备；也能从作品 Tag 继续发现相关作品。

## Current behavior

- 搜索和声优角色列表每页 18 条，必须手动点击下一页。
- 图片下载完成前直接留空或突然出现。
- 详情查询期间只显示通用卡片骨架。
- API 只有 Markdown 契约，没有 OpenAPI 文档。
- VN 详情尚未展示 Tag。

## Proposed behavior

1. 列表每页调整为 12 条。
2. 距离列表底部约 600px 时自动请求下一页，同时保留可键盘操作的“继续加载”按钮。
3. 图片容器从第一帧就保持最终尺寸，先显示纸张纹理骨架，再淡入图片；加载失败显示文字占位。
4. 实体详情首次加载显示“资料抽屉”整页场景，避免内容突然跳入。
5. 搜索类型增加 Tag；VN 详情展示无剧透、非成人 Tag。
6. Tag 详情分页显示相关 VN，可继续进入作品关系链。
7. `/api/v1/openapi.json` 返回 OpenAPI 3.1 文档，`/api/docs` 提供可读入口。
8. 列表后台始终多缓存一页，一次滚动只揭示一页。
9. 卡片在 pointerenter、focus 和 pointerdown 时预取目标详情与关键图片。
10. Tag 使用简体中文优先显示，并支持中文搜索和英文回退。

## Data model impact

- `EntityType` 增加 `tag`。
- `VnDetail` 增加 `tags`，每项包含 Tag、rating 和 spoiler。
- 新增 Tag detail 与 Tag→VN 分页 DTO。
- 中文 Tag 来自 VNDB Profile Search 的 CC BY 4.0 翻译，以生成式 ID 映射接入；英文原名保留在稳定 DTO 中。

## UI impact

- 沿用“视觉资料柜”视觉系统。
- 加载场景采用固定尺寸和低成本 opacity/transform 动画，并尊重 reduced motion。
- Tag 使用 `#` 字形封面，与图片实体在同一探索轨迹中工作。

## Acceptance criteria

- 首次打开未缓存详情时立刻出现稳定加载场景。
- 图片加载前后卡片尺寸不变化，失败时有占位内容。
- 搜索/声优/Tag 列表单页最多 12 条，并能在接近底部时自动取下一页。
- 手动加载按钮仍可用，自动加载不会并发重复请求。
- 首屏可请求两页但只显示 12 条；揭示缓存页后再准备后一页。
- hover、键盘 focus 和触屏 pointerdown 预取复用路由查询缓存。
- 中文 Tag 可直接搜索，缺失翻译时回退英文。
- VN 详情能点击 Tag；Tag 页面能返回相关 VN。
- OpenAPI JSON 含全部公开 v1 路径和核心 schema。
- 类型检查、测试、生产构建、真实浏览器桌面和移动验证通过。

## Open questions

- 中文 Tag 翻译的自动更新频率与人工校对流程。
- 生产环境是否将图片 URL 交由独立图片代理/CDN 做缩略图和格式转换。

