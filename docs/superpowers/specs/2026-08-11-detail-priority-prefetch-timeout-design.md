# 详情优先级、预取预算与超时处理设计

## 目标

消除角色卡片先被 low 预取、点击后仍排在低优先级队列中的问题；限制 hover 产生的投机流量；把 VNDB 超时从可能约 39 秒的自动重试链收敛为一次最长 12 秒的明确失败。保持现有 React Query cache key、BFF 共享任务、1500ms 启动间隔和最大并发 2 不变。

## 方案选择

采用“独立 high 提升请求＋低优先级预算＋504 不重试”。没有选择把 priority 放入 React Query key，因为会分裂缓存并重复保存同一实体；没有选择彻底关闭预取，因为会损失命中时的即时跳转；没有选择拆分角色基本资料与出演作品，因为实测小角色请求的主要延迟来自排队和上游波动，而不是响应体大小。

## 1. 点击时提升详情请求

- hover/focus 继续调用 React Query 的 low 预取。
- 卡片发生 `pointerdown` 或键盘/鼠标 `click` 时，绕过 React Query 去重，直接向相同 BFF 详情端点发送一次 high 请求。
- 每个已挂载卡片最多发出一次提升请求；鼠标的 pointerdown 与随后 click 不重复发送。
- 提升响应不单独写入 React Query；页面仍复用原预取 Promise。BFF 按现有 cache key 合并消费者，并将 queued 任务原地提升为 high，因此不会产生第二次 VNDB 上游查询。
- 支持 VN、角色、Staff 和 Tag 的详情链接；本轮只提升实体详情，不额外提升 Staff/Tag 的关系分页。

## 2. hover 预取防抖与预算

- `pointerenter` 后等待 150ms 才开始 low 预取；`pointerleave` 或组件卸载会取消尚未触发的 timer。
- focus 预取保持即时，pointerdown/click 走 high 提升。
- 每个 QueryClient 同时最多允许 3 个不同实体的 low 意图预取；达到预算后直接丢弃新的投机任务，不在浏览器内建立第二层等待队列。
- 相同实体继续由 React Query 去重；任务 settle 后释放预算。aggressive 模式同样受此预算约束。

## 3. 超时与重试

- BFF 将 VNDB `TimeoutError` 映射为 HTTP 504，错误码为 `UPSTREAM_TIMEOUT`；OpenAPI 同步记录 504。
- React Query 对 504、429、取消和 AbortError 不自动重试；其他可重试错误最多重试 1 次。
- 角色页已有错误面板与“重新加载”按钮，超时后由用户明确重试，不增加新 UI。
- VNDB 单次 12 秒 timeout 保持不变。

## 测试与验收

- 组件测试证明 hover 150ms 前不请求、离开可取消、pointerdown/click 只发一次 high 提升，键盘 click 也会提升。
- 查询测试证明最多 3 个 low 预取在途，第四个被丢弃，settle 后预算恢复。
- API 测试证明 TimeoutError 返回 504/`UPSTREAM_TIMEOUT`，OpenAPI 包含 504。
- 重试策略测试证明 504 不重试，普通 5xx 最多重试一次。
- 浏览器在 cold 角色卡场景验证：hover 请求为 low，点击后出现 high 提升；角色页面 URL 正确、无控制台错误。桌面与 390px 各验证一次。

## 不在本轮范围

- 不调整 VNDB 的 1500ms 限速、并发 2 或 aging 策略。
- 不拆分或分页角色出演作品接口。
- 不增加 Service Worker、图片代理或持久化前端缓存。
