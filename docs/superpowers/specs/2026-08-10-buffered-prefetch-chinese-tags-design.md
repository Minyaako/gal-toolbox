# 双页缓冲、意图预取与中文 Tag 设计

## Feature

改善首次访问与连续浏览的等待观感：列表后台始终多准备一页但一次只展示一页；用户表现出打开卡片的意图时预取详情和关键图片；Tag 同时支持简体中文显示与中文搜索。

## User goal

- 首屏只看 12 条结果，避免一次出现过多内容。
- 浏览到页尾时立即看到已准备好的下一页，不等待 VNDB。
- 鼠标悬停、键盘聚焦或触屏按下卡片后，真正打开详情时尽量没有空等。
- 能用“悬疑”“时间旅行”等中文名称识别和搜索 VNDB Tag，同时保留英文定位信息。

## Current behavior

- React Query 在内存中缓存查询 5 分钟，API 使用 SQLite 缓存 VNDB 响应。
- 无限列表取得下一页后会立即把所有已请求页展开，无法“加载两页、只显示一页”。
- 卡片没有基于 hover、focus 或 pointerdown 的详情预取。
- 图片有骨架、淡入和失败占位，但首次连接 VNDB 图片域名没有预连接。
- Tag 只显示和搜索 VNDB 英文原名。

## Chosen approach

采用前端双层分页状态，不改变公开 API 的一页 12 条语义：

1. “已加载页”由 React Query infinite query 管理。
2. “可见页数”由页面本地状态管理，初始为 1。
3. 首屏成功后，只要仍有下一页且已加载页数不大于可见页数，就静默请求一页作为缓冲。
4. 接近列表底部时，如果缓冲页存在，只增加一次可见页数；随后继续静默准备下一页。
5. 如果缓冲页尚未完成，保持当前列表和小型加载提示，完成后只揭示一页。

不采用“API 一次返回 24 条再由前端切页”，因为它会破坏 API 分页含义。不在本轮引入 Service Worker 或图片代理；两者可在取得真实首访指标后单独评估。

## Architecture

### Buffered pagination

新增可复用的 buffered infinite-list hook。它消费 TanStack infinite query 的 pages、hasNextPage、isFetchingNextPage 与 fetchNextPage，产出：

- 仅包含可见页的 items。
- 当前是否存在已加载但未展示的缓冲页。
- 是否还能继续展示或请求。
- revealNextPage：一次最多展示一页。

搜索结果、声优角色和 Tag 作品列表共用该 hook。查询 key 变化时可见页数重置为 1。

### Intent prefetch

卡片导航链接在以下事件调用同一个幂等预取入口：

- pointerenter：鼠标或支持 hover 的指针。
- focus：键盘导航。
- pointerdown：触屏用户按下卡片。

预取入口按实体类型使用与详情页完全相同的 query key 和 query function：

- VN：详情，并预加载封面与角色缩略图。
- Character：详情及角色主图。
- Staff：详情和首批 12 个关联角色。
- Tag：详情和首批 12 个关联作品。

React Query 负责复用已完成或进行中的请求。预取失败保持静默；用户真正导航后仍由详情页现有错误状态处理。

### Cache layers

- React Query：详情 staleTime 5 分钟，gcTime 30 分钟；搜索和列表沿用内存缓存。
- HTTP：搜索与分页响应使用 60 秒 public cache，详情响应使用 300 秒 public cache；OpenAPI 维持 1 小时。
- SQLite：继续作为 VNDB 上游的跨请求持久缓存和 stale fallback。
- 图片：保留 VNDB CDN URL，不由本项目永久镜像；HTML 对 VNDB 图片域名使用 preconnect。详情数据预取成功后，用浏览器 Image 对即将需要的图片进行低优先级预加载。

本轮不把 React Query 数据写入 localStorage，避免版本迁移、容量和敏感分级图片元数据长期驻留问题。

## Chinese Tag data

翻译来源为 [JodieRuth/VNDB-Profile-Search](https://github.com/JodieRuth/VNDB-Profile-Search) 的 Tag/Trait 翻译数据。翻译文本单独按 CC BY 4.0 使用，署名为“VNDB Profile Search contributors”。

仓库保存一个精简、生成式 Tag 映射，只包含：

- VNDB Tag ID。
- 英文名称。
- 简体中文名称。

同步脚本下载上游翻译文件、解码其 Base64 字段并生成稳定排序的 TypeScript 数据模块。生成文件记录来源仓库和同步提交。

Tag 映射规则：

- 有中文翻译：name.primary 为简体中文，name.original 为 VNDB 英文名。
- 无中文翻译：name.primary 为 VNDB 英文名，name.original 为 null。
- alternatives 同时保留 VNDB aliases 和不重复的英文名称。

中文 Tag 搜索在 API 本地映射中执行，匹配简中和英文，按完全匹配、前缀匹配、包含匹配排序，然后按现有 page/pageSize 分页。英文查询继续使用 VNDB searchrank；返回结果同样应用中文映射。中文映射读取失败时，服务仍可启动并退回 VNDB 英文行为。

## UI behavior

- 沿用“视觉资料柜”的现有布局、配色和密度。
- Tag 卡片和 Tag 详情以中文为主标题、英文为副标题。
- VN Tag 云同样中文优先，并把英文保留为可扫描的辅助文本或可访问名称。
- 列表底部文案区分“下一页已准备好”和“正在准备下一页”，但不增加新的强视觉控件。
- hover 预取不显示弹窗或进度提示，避免制造视觉噪声。
- 键盘焦点、触屏点击和 reduced motion 行为保持现有可访问性标准。

## Error handling

- 缓冲页请求失败不移除当前可见内容；加载器恢复为可重试按钮。
- 意图预取失败不显示全局错误，也不阻止导航。
- 中文翻译缺失时逐条回退英文，不把缺失当成接口错误。
- 翻译同步脚本遇到无效结构、缺少 tags 或无法解码时以非零状态退出，避免生成半份数据。

## Testing

自动化测试覆盖：

1. 首次取得两页数据时只返回第一页的可见 items。
2. revealNextPage 一次只增加一页，并触发下一缓冲页条件。
3. query key 改变后可见页数回到 1。
4. 同一实体的 hover、focus 预取复用同一 query key。
5. Tag 映射中文优先、英文回退和 alternatives 去重。
6. 中文 Tag 搜索的完全匹配、前缀匹配、包含匹配和分页。
7. API Cache-Control 头符合详情 300 秒、列表 60 秒。

浏览器验收覆盖：

- 首屏网络中出现第 1、2 页请求，但 DOM 只显示 12 张卡片。
- 到达页尾后立即显示第 2 页，并出现第 3 页后台请求。
- hover 或 focus 卡片后，在点击前出现详情请求；点击后不重复请求。
- 中文 Tag 搜索、VN→中文 Tag→VN 链路可用。
- 桌面与 390×844 移动布局无溢出，控制台 0 errors。

## Acceptance criteria

- 列表稳定保持“一页可见、一页缓冲”，每次滚动触发最多新增 12 条。
- 缓冲页已存在时揭示下一页不产生网络等待。
- pointerenter、focus 和 pointerdown 均能触发详情预取，重复意图不产生并发重复请求。
- 中文 Tag 可显示、可搜索；英文名称始终可定位，缺失翻译时可靠回退。
- 公开 API 仍保持 page/pageSize=12 语义，未来前端无需知道缓冲实现。
- 翻译来源、许可证和同步方式在仓库中可追溯。
- 类型检查、测试、构建、依赖审计和真实浏览器验收通过。

## Out of scope

- Service Worker 离线缓存。
- 本项目图片代理、格式转换或永久镜像。
- Trait 中文化和 Trait 探索。
- 中文 Tag 描述翻译。
- React Query 持久化到 localStorage 或 IndexedDB。
