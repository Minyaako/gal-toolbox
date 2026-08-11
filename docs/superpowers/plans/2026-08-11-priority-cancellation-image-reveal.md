# VNDB Priority, Cancellation, and Image Reveal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let user-initiated VNDB work bypass queued background work, cancel abandoned consumers safely, expose queue timing, and make sensitive-image reveal controls reliably operable without navigation.

**Architecture:** Replace the serial VNDB promise tail with a small shared-key priority scheduler that owns queueing, consumers, cancellation, concurrency, and start cadence; keep `VndbClient` responsible for cache keys, SQLite, VNDB payloads, errors, and stale fallback. Thread a non-keyed `priority` and React Query's `AbortSignal` through the web API/BFF boundary, then make cards use a sibling stretched link and independently layered image control.

**Tech Stack:** TypeScript, Fastify 5, native `AbortController`/`AbortSignal`, SQLite cache, React 19, React Router 7, TanStack React Query 5, Vitest 4, Vite.

## Global Constraints

- Only change request scheduling, request cancellation, required observability, and sensitive-image interaction; do not change cache TTL values, VNDB response DTOs, or VNDB API request bodies.
- Keep priority values exactly `high`, `normal`, and `low`; priority changes queue order only and must never enter a React Query query key or SQLite cache key.
- Retain at most two concurrent VNDB requests and at least 1500 ms between starts (except tests explicitly construct the scheduler with a shorter interval).
- Preserve the existing 12-second upstream timeout, 429/error mapping, Chinese user-visible errors, and stale-cache fallback; client cancellation must not become a new 502 or trigger retries.
- Do not add Service Worker, Redis, distributed scheduling, adaptive rate limiting, a global performance dashboard, image proxying, or a React Query data-layer rewrite.
- Keep this implementation as exactly the two tasks below; fold necessary dependency/configuration/test setup into its owning task rather than creating extra tasks.
- Maintain keyboard operation and `aria-label="显示分级图片"`; use short visible copy `显示` only for 72–82 px image contexts and keep full copy on larger images.

---

## File Structure

- `apps/api/src/request-scheduler.ts` — owns priority ordering, start cadence, concurrency, aging, shared consumers, and cancellation without knowing VNDB DTOs.
- `apps/api/src/request-scheduler.test.ts` — deterministic scheduler tests using fake time and controllable work promises.
- `apps/api/src/vndb.ts` — integrates the scheduler with cache lookup, VNDB fetch, stale fallback, query options, and timing metadata.
- `apps/api/src/vndb.test.ts` — extends the existing client tests for cache/scheduler integration, timeout, abort, and stale fallback.
- `apps/api/src/app.ts` — reads the same-origin priority header, translates Fastify disconnects into consumer cancellation, sets timing/priority headers, and logs queue metadata.
- `apps/api/src/app.test.ts` — verifies response headers and that normal BFF cancellation does not serialize as an upstream failure.
- `apps/api/src/openapi.ts`, `apps/api/src/openapi.test.ts` — documents the priority request header and timing/priority response headers.
- `apps/web/src/api.ts` — exports request options and forwards signal and priority in fetch headers.
- `apps/web/src/api.test.ts` — verifies signals/headers and priority-independent request paths.
- `apps/web/src/queries.ts` — assigns query-function priorities while preserving existing query keys and uses low priority for intent prefetch.
- `apps/web/src/queries.test.ts` — verifies signal propagation, intended priorities, cache-key sharing, and no cancellation retry.
- `apps/web/src/query-client.ts`, `apps/web/src/query-client.test.ts` — make abort retry policy explicit and regression-testable.
- `apps/web/src/buffered-pages.ts`, `apps/web/src/buffered-pages.test.ts` — distinguish automatic `normal` fetches from user `high` fetches and promote an already queued buffer without changing visible-page behavior.
- `apps/web/src/pages/SearchPage.tsx`, `apps/web/src/pages/StaffPage.tsx`, `apps/web/src/pages/TagPage.tsx` — pass query-function signals and distinguish user click/automatic buffering priority without changing pagination state.
- `apps/web/src/components.tsx` — makes `EntityImage` expose a standalone reveal control and makes `EntityCard`/VN cast image and detail link siblings.
- `apps/web/src/pages/VnPage.tsx` — applies the sibling interaction structure to compact cast character images.
- `apps/web/src/styles.css`, `apps/web/src/styles/knowledge.css` — establish explicit content/link/reveal layers, stretched-card hit areas, and compact control sizing without clipping at 390 px.
- `apps/web/src/components.test.tsx`, `apps/web/src/pages/VnPage.test.tsx` — happy-dom interaction and DOM-structure coverage using the explicitly added `happy-dom` web dev dependency.

### Task 1: Prioritized, Cancellable VNDB Scheduler and End-to-End Request Semantics

**Files:**
- Create: `apps/api/src/request-scheduler.ts`
- Create: `apps/api/src/request-scheduler.test.ts`
- Modify: `apps/api/src/vndb.test.ts`
- Modify: `apps/api/src/vndb.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/app.test.ts`
- Modify: `apps/api/src/openapi.ts`
- Modify: `apps/api/src/openapi.test.ts`
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/api.test.ts`
- Modify: `apps/web/src/queries.ts`
- Modify: `apps/web/src/queries.test.ts`
- Modify: `apps/web/src/query-client.ts`
- Create: `apps/web/src/query-client.test.ts`
- Modify: `apps/web/src/buffered-pages.ts`
- Modify: `apps/web/src/buffered-pages.test.ts`
- Modify: `apps/web/src/pages/SearchPage.tsx`
- Modify: `apps/web/src/pages/StaffPage.tsx`
- Modify: `apps/web/src/pages/TagPage.tsx`

**Interfaces:**
- Consumes: existing `cacheKey(endpoint, body)`, `CacheStore`, existing Fastify routes, and TanStack query/infinite-query function contexts.
- Produces: `RequestScheduler.schedule<T>({ key, priority, signal, run }): Promise<ScheduledResult<T>>`, where `run(signal)` is DTO-agnostic; `export type RequestPriority = "high" | "normal" | "low"`; `export type VndbQueryOptions = { priority?: RequestPriority; signal?: AbortSignal }`; `VndbClient.query<T>(endpoint, body, ttlMs, options?: VndbQueryOptions): Promise<QueryResult<T>>`, where `QueryResult` additionally exposes `queueWaitMs`, `upstreamDurationMs`, `queueDepth`, and final `priority` for BFF headers/logging; web `ApiRequestOptions` with the same optional `signal`/`priority` fields; query option factories whose `queryFn` accepts `{ signal }`.
- Produces: `useBufferedPages` accepts `fetchNextPage(priority: "high" | "normal")` and `promoteNextPage(): Promise<unknown>`; its effect calls `fetchNextPage("normal")`, while a user reveal calls `fetchNextPage("high")` when idle or `promoteNextPage()` and awaits the stored buffer promise when a normal fetch is already queued.
- Produces: the same-origin request header `X-Request-Priority` and BFF response headers `Server-Timing: queue;dur=<ms>, upstream;dur=<ms>` and `X-Request-Priority: <final-priority>`; cache hits return zero queue/upstream durations and do not enter the scheduler.

- [ ] **Step 1: Write the failing scheduler tests in `apps/api/src/request-scheduler.test.ts` and client integration tests in `apps/api/src/vndb.test.ts`.**

  Build a controllable clock (`now`, scheduled timer callbacks) and fetcher that records starts and exposes each fetch `AbortSignal`. Cover the scheduler contract with the concrete assertions below; use `intervalMs: 1500`, `maxConcurrent: 2`, and an aging threshold of 8000 ms in the production constructor, while the clock advances rather than sleeping.

  ```ts
  const low = client.query("/vn", body("low-1"), 60_000, { priority: "low" });
  await flushScheduler();
  expect(fetchStarts).toEqual(["low-1"]);
  const normal = client.query("/vn", body("normal-1"), 60_000, { priority: "normal" });
  const high = client.query("/vn", body("high-1"), 60_000, { priority: "high" });
  resolveFetch("low-1");
  await low;
  advanceToNextStart();
  expect(fetchStarts).toEqual(["low-1", "high-1"]);
  await normal;
  ```

  Add separate scheduler tests asserting: FIFO for equal priorities; never more than two unresolved work promises and starts at least 1500 ms apart; a low item waiting 8000 ms is promoted and eventually starts; aborting a queued sole consumer removes it without calling `run`; aborting the last running consumer aborts the recorded work signal; aborting one same-key prefetch consumer leaves the detail consumer resolved; and joining a queued low same-key request with `{ priority: "high" }` starts it before unrelated normal work. In `vndb.test.ts`, assert a pre-populated fresh cache returns `HIT` without scheduler/fetch work, stale fallback still resolves after a non-abort upstream error, and abort and timeout remain distinguishable error paths.

- [ ] **Step 2: Run the new scheduler tests and confirm RED.**

  Run: `npm.cmd run test -w @gal-toolbox/api -- src/request-scheduler.test.ts src/vndb.test.ts`

  Expected: FAIL because `RequestPriority`/query options and the priority/cancellation scheduler behavior do not yet exist; existing `RequestPacer` still serializes each fetch to completion.

- [ ] **Step 3: Implement the DTO-agnostic scheduler and integrate it into `VndbClient`.**

  Create `request-scheduler.ts` with a map from key to one queued/running work item and a collection of independently abortable consumer promises. Its selection rule must be `high`, then `normal`, then `low`, FIFO within a tier, with a one-tier aging promotion after 8000 ms. Before dispatch, enforce both `running < 2` and `Date.now() >= nextStartAt`; update `nextStartAt` at start, not completion. A later same-key consumer raises the queued work's effective priority (never creates a second `run`); cancelling one rejects only that consumer; removing the final consumer removes queued work or calls the work's internal controller abort when running.

  Remove `RequestPacer` and the duplicate in-flight map from `VndbClient`, then call the scheduler only after a cache miss. Keep cache lookup/cache write/stale fallback in `VndbClient`. Combine each running work item's internal controller signal with `AbortSignal.timeout(12_000)` for fetch, classify internal/client abort separately from timeout, and let the scheduler clear its shared key in `finally`. Return timing metadata from cache and miss/stale paths so callers never need to inspect scheduler internals.

- [ ] **Step 4: Write failing BFF and web-boundary tests before changing the routes/queries.**

  In `apps/api/src/app.test.ts`, inject a cold `GET /api/v1/vns/v17` with `X-Request-Priority: high` and assert:

  ```ts
  expect(response.headers["x-request-priority"]).toBe("high");
  expect(response.headers["server-timing"]).toMatch(/queue;dur=\d+(?:\.\d+)?, upstream;dur=\d+(?:\.\d+)?/);
  ```

  Add a controlled BFF disconnect test by listening on an ephemeral localhost port, starting a request against a fetcher promise, aborting the browser-side `fetch`, and asserting the recorded upstream signal aborts without a 502 response body. Extend `openapi.test.ts` to assert `X-Request-Priority` is a documented request header and `Server-Timing` plus `X-Request-Priority` are documented response headers. In `apps/web/src/api.test.ts`, stub `fetch`, call `getVn("v17", { signal, priority: "high" })`, and assert the same signal instance and `X-Request-Priority: high` header were passed. In `apps/web/src/queries.test.ts`, invoke each query function with a distinct signal and assert detail/search uses `high`, first relation pages/automatic next pages use `normal`, `prefetchEntity` uses `low`, and `vnQuery("v17").queryKey` remains exactly `["vn", "v17"]` regardless of priority.

  In `apps/web/src/buffered-pages.test.ts`, add one test where the effect path calls `fetchNextPage("normal")`, and one where a user reveal during that pending promise calls `promoteNextPage()`, awaits the original promise, then reveals exactly one page. In `apps/web/src/query-client.test.ts`, call the exported retry predicate with an `AbortError` and assert `false`, then with an ordinary first failure and assert `true`.

- [ ] **Step 5: Run the boundary tests and confirm RED.**

  Run: `npm.cmd run test -w @gal-toolbox/api -- src/app.test.ts src/openapi.test.ts && npm.cmd run test -w @gal-toolbox/web -- src/api.test.ts src/queries.test.ts src/buffered-pages.test.ts src/query-client.test.ts`

  Expected: FAIL because `api()` has no options, query functions discard React Query signals, routes do not read/write priority/timing headers, and cancellation is not converted into a consumer cancellation.

- [ ] **Step 6: Thread priority and cancellation through BFF and React Query.**

  In `apps/web/src/api.ts`, make `api<T>(path, options: ApiRequestOptions = {})` forward `options.signal` to `fetch` and add `X-Request-Priority` with `options.priority ?? "normal"`; add the same optional final argument to every exported getter. In `apps/web/src/queries.ts`, change every `queryFn` to `({ signal }) => getX(..., { signal, priority: ... })` without changing `queryKey`; use `high` for search/detail, `normal` for first relation pages, and `low` in `prefetchEntity`.

  In `buffered-pages.ts`, store the promise started by automatic buffering. Change its fetch callback to accept a priority: the effect uses `normal`; a user reveal with no request running uses `high`; a user reveal while the normal promise is pending calls the supplied `promoteNextPage()` and then awaits the stored promise before dispatching one reveal. In Search/Staff/Tag pages, keep a ref read by the infinite queryFn for the next-page priority, and provide a promotion callback that issues the identical page request with `high`. The BFF same-key task shares the one VNDB fetch and raises its queued priority; the duplicate HTTP consumer does not create duplicate upstream work. Export a pure retry predicate from `query-client.ts` that returns false for `AbortError`/client cancellation and retains the existing retry count/429 behavior for real failures.

  In `apps/api/src/app.ts`, parse only valid header values (fall back to `normal`), create/forward a signal that aborts when the Fastify request is closed, remove the disconnect listener after completion, pass `{ priority, signal }` to every `client.query`, set cache/public headers plus the two observability headers, and log endpoint, cache status, queue wait, upstream duration, queue depth, and `request.id`. Treat cancellation as an ended request rather than converting it to the 502 error handler; leave 429/stale/error responses unchanged. Update `openapi.ts` with the tested request/response header definitions without changing JSON DTO schemas.

- [ ] **Step 7: Run focused tests, type checks, and the full suite to confirm GREEN.**

  Run: `npm.cmd run test -w @gal-toolbox/api -- src/request-scheduler.test.ts src/vndb.test.ts src/app.test.ts src/openapi.test.ts && npm.cmd run test -w @gal-toolbox/web -- src/api.test.ts src/queries.test.ts src/buffered-pages.test.ts src/query-client.test.ts && npm.cmd run typecheck && npm.cmd test`

  Expected: PASS. The scheduler tests prove priority/FIFO/aging/concurrency/start cadence/cancellation/dedup/cache-hit behavior; route tests prove headers and cancellation handling; web tests prove signals/priorities/query-key sharing/no abort retry.

- [ ] **Step 8: Perform browser acceptance for request scheduling.**

  Run the local app with a cold cache, open a staff page that has enough roles to buffer page two, then immediately submit a different search. In DevTools Network, verify the visible search begins ahead of queued low-prefetch work, the background next page later starts, abandoning the old search cancels its browser request, and successful BFF responses show `Server-Timing` queue/upstream metrics and `X-Request-Priority`. Record the exact page IDs and observed header values in the implementation PR/commit notes; do not change source to accommodate an unavailable external VNDB response.

- [ ] **Step 9: Commit Task 1 only.**

  ```bash
  git add apps/api/src/request-scheduler.ts apps/api/src/request-scheduler.test.ts apps/api/src/vndb.ts apps/api/src/vndb.test.ts apps/api/src/app.ts apps/api/src/app.test.ts apps/api/src/openapi.ts apps/api/src/openapi.test.ts apps/web/src/api.ts apps/web/src/api.test.ts apps/web/src/queries.ts apps/web/src/queries.test.ts apps/web/src/query-client.ts apps/web/src/query-client.test.ts apps/web/src/buffered-pages.ts apps/web/src/buffered-pages.test.ts apps/web/src/pages/SearchPage.tsx apps/web/src/pages/StaffPage.tsx apps/web/src/pages/TagPage.tsx
  git commit -m "feat: prioritize and cancel VNDB requests"
  ```

### Task 2: Sensitive-Image Reveal DOM, Layering, and Interaction Tests

**Files:**
- Modify: `apps/web/src/components.tsx`
- Modify: `apps/web/src/pages/VnPage.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/styles/knowledge.css`
- Modify: `apps/web/src/components.test.tsx`
- Modify: `apps/web/src/pages/VnPage.test.tsx`
- Modify: `apps/web/package.json` (add `happy-dom` as a dev dependency for interaction tests)
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `EntityImage` image data, `EntityPrefetchLink`, existing card/cast CSS classes, and React Router navigation.
- Produces: `EntityImage` accepts an optional `compact?: boolean` context flag and renders a real `<button type="button" class="reveal-image" aria-label="显示分级图片">`; a card/cast caller renders image and detail link as siblings, with a link-only stretched hit area rather than a button nested inside an anchor.
- Produces: CSS layer contract `.image-frame > .entity-image` (content layer), `.card-link`/cast link (card navigation layer), and `.reveal-image` (highest interactive layer with explicit `z-index`); image reveal prevents neither keyboard activation nor detail-link navigation except for its own click.

- [ ] **Step 1: Write the failing DOM and interaction tests.**

  Extend `apps/web/src/components.test.tsx` with sensitive image fixtures where `sexual: 1` and where `violence: 1`. Static-render an `EntityCard` and assert there is exactly one reveal button, it has `aria-label="显示分级图片"`, and no anchor contains a button:

  ```ts
  const container = renderSensitiveCard(sensitiveEntity);
  expect(container.querySelector('[aria-label="显示分级图片"]')).not.toBeNull();
  expect(container.querySelector("a button")).toBeNull();
  ```

  Add `happy-dom` as an `apps/web` dev dependency and run this test file with Vitest's happy-dom environment. In the DOM test, mount `EntityCard` under `MemoryRouter` with a `useLocation()` probe, call the reveal button's native `.click()`, and assert the image loses `is-sensitive` while the probe path stays unchanged; then click the stretched sibling link and assert the path changes to the fixture entity's exact `entityPath`. Render the compact cast character in `apps/web/src/pages/VnPage.test.tsx` and assert visible text is `显示`, full `aria-label` remains present, and `container.querySelector("a button")` is null. Read the two stylesheet files in the test and assert the compact reveal selector supplies a non-clipping size/overflow rule and an explicit z-index greater than the link layer. Native Enter/Space activation is verified in the browser step rather than simulated by happy-dom.

- [ ] **Step 2: Run focused image tests and confirm RED.**

  Run: `npm.cmd run test -w @gal-toolbox/web -- --environment happy-dom src/components.test.tsx src/pages/VnPage.test.tsx`

  Expected: FAIL because card and cast markup nest `EntityImage` (and its button) inside `EntityPrefetchLink`; the button has no explicit high stacking layer, and compact controls use the full label.

- [ ] **Step 3: Implement sibling DOM structure and layered reveal behavior.**

  Refactor `EntityCard` so `<EntityImage ... />` and `EntityPrefetchLink` are siblings inside the article. Keep copy inside the link, and make the link's pseudo-element/stretch layer cover the image/card area while keeping the image's reveal control above it. Apply the same pattern in `VnPage`'s character cast entry: image frame is sibling to the `EntityPrefetchLink`, retaining the character detail navigation target and existing intent-prefetch handlers. Do not wrap `EntityImage` in a link anywhere it can render its button; detail page hero images remain unlinked.

  In `EntityImage`, keep reveal state local to the currently resolved source. Give the button `aria-label="显示分级图片"`; choose visible copy `显示` when `compact` is true, otherwise `显示分级图片`. Do not add custom keyboard handlers: native button semantics must supply Tab, Enter, and Space. Use the exact class/layer relationship in CSS: image content at z-index 1, stretched navigation layer at z-index 2, reveal button at z-index 3; assign appropriate `position`/stacking contexts, ensure the button receives pointer events over a blurred image, and preserve responsive aspect ratios. For the 72–82 px cast/relation cases, provide compact padding/min-height/overflow rules so the short button fits without clipping at 390 px.

- [ ] **Step 4: Run focused tests and visual browser acceptance to confirm GREEN.**

  Run: `npm.cmd run test -w @gal-toolbox/web -- --environment happy-dom src/components.test.tsx src/pages/VnPage.test.tsx && npm.cmd run typecheck`

  Expected: PASS. Then run the app and inspect a sensitive detail cover, a sensitive list card, and a sensitive VN cast thumbnail at desktop width and a 390 px viewport. For each, Tab to the reveal button and use Enter and Space; confirm it clears only blur, remains on the current route, and the adjacent/stretched link still opens details when clicked. Confirm DevTools Elements has no `<button>` under `<a>` and that the compact button is visible and clickable rather than clipped.

- [ ] **Step 5: Commit Task 2 only.**

  ```bash
  git add apps/web/src/components.tsx apps/web/src/pages/VnPage.tsx apps/web/src/styles.css apps/web/src/styles/knowledge.css apps/web/src/components.test.tsx apps/web/src/pages/VnPage.test.tsx apps/web/package.json package-lock.json
  git commit -m "fix: make sensitive image reveal controls operable"
  ```

## Final Root Verification

- [ ] Run `git status --short` and confirm only intended work is present (or a clean tree after the two commits).
- [ ] Run `npm.cmd run typecheck && npm.cmd test && npm.cmd run build` from the repository root.
- [ ] Re-run the Task 1 cold-cache scheduling acceptance and the Task 2 desktop/390 px reveal acceptance after both commits together, checking that headers, cancellation, link navigation, and image reveal behavior coexist.
- [ ] Inspect `git log -2 --oneline` and confirm exactly one commit per implementation task with the messages above; do not squash or create extra implementation commits.
