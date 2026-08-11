# Detail Priority, Prefetch Budget, and Timeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure a clicked entity detail is promoted above speculative work, cap hover prefetch traffic, and prevent VNDB timeouts from expanding into repeated 12-second attempts.

**Architecture:** Keep React Query cache keys stable. Low intent prefetch remains cached through React Query, while a separate direct high-priority request promotes the matching BFF scheduler item without duplicating VNDB work. A small per-QueryClient budget drops excess speculative prefetches, and the API exposes TimeoutError as 504 so the existing UI retry button owns recovery.

**Tech Stack:** React 19, TanStack React Query, TypeScript, Vitest + happy-dom, Fastify, OpenAPI 3.1.

## Global Constraints

- Keep VNDB minimum start interval at 1500ms, maximum concurrency at 2, and aging at 8000ms.
- Keep existing React Query keys and BFF cache keys unchanged.
- Delay pointer hover prefetch by 150ms and allow at most 3 distinct low intent prefetches per QueryClient.
- Map TimeoutError to HTTP 504/`UPSTREAM_TIMEOUT`; never automatically retry 504, 429, AbortError, or React Query cancellation.
- Other retryable failures receive at most one retry.
- Do not split character appearances into another endpoint.

---

### Task 1: Promote Clicked Details and Bound Intent Prefetch

**Files:**
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/queries.ts`
- Modify: `apps/web/src/queries.test.ts`
- Modify: `apps/web/src/components.tsx`
- Modify: `apps/web/src/components.test.tsx`

**Interfaces:**
- Produces: `promoteEntity(entity: EntitySummary): Promise<void>` sends one direct high-priority detail request for `vn`, `character`, `staff`, or `tag` without writing a second React Query cache entry.
- Produces: `prefetchEntity(...)` keeps its public signature but admits at most 3 distinct active low intent tasks per QueryClient and drops excess tasks.
- Produces: `entityPrefetchHandlers(preference, prefetch, promote, schedule)` separates delayed hover, immediate focus, and high pointer/click promotion and returns cleanup-capable handlers used by `EntityPrefetchLink`.

- [ ] **Step 1: Write failing query tests for high promotion and the three-slot budget**

Add tests that use a real `QueryClient`, deferred `fetch` responses, and literal headers:

```ts
const low = prefetchEntity(client, character);
await Promise.resolve();
const promotion = promoteEntity(character);
expect(priorities).toEqual(["low", "high"]);

const four = entities.map((entity) => prefetchEntity(client, entity));
await Promise.resolve();
expect(startedIds).toEqual(["c1", "c2", "c3"]);
releaseAll();
await Promise.all(four);
await prefetchEntity(client, entity4);
expect(startedIds).toEqual(["c1", "c2", "c3", "c4"]);
```

- [ ] **Step 2: Run query tests and verify RED**

Run: `npm.cmd run test -w @gal-toolbox/web -- src/queries.test.ts`

Expected: FAIL because `promoteEntity` is absent and the fourth low prefetch starts immediately.

- [ ] **Step 3: Implement direct entity promotion and the per-client budget**

Add a detail endpoint dispatcher in `api.ts`/`queries.ts`; call the existing DTO functions with `{ priority: "high" }`. Use a `WeakMap<QueryClient, Set<string>>` for active low intent keys. Return immediately when a different fourth key arrives; release the key in `finally`. Existing React Query dedupe remains responsible for duplicate calls to the same key.

- [ ] **Step 4: Run query tests and verify GREEN**

Run: `npm.cmd run test -w @gal-toolbox/web -- src/queries.test.ts`

Expected: all query tests PASS, including literal `low, high` headers and restored budget after settle.

- [ ] **Step 5: Write failing component tests for debounce, cancellation, and one-shot promotion**

Use fake timers and a mounted real `EntityCard`:

```ts
pointerEnter(link);
await vi.advanceTimersByTimeAsync(149);
expect(priorities).toEqual([]);
await vi.advanceTimersByTimeAsync(1);
expect(priorities).toEqual(["low"]);

pointerLeave(link);
await vi.advanceTimersByTimeAsync(150);
expect(priorities).toEqual([]);

pointerDown(link);
link.click();
expect(priorities.filter((item) => item === "high")).toHaveLength(1);
```

Add a separate keyboard `click()` case that receives one high request without pointerdown.

- [ ] **Step 6: Run component tests and verify RED**

Run: `npm.cmd run test -w @gal-toolbox/web -- src/components.test.tsx`

Expected: FAIL because hover is immediate, pointer leave has no timer to cancel, and pointerdown still invokes low prefetch rather than a high promotion.

- [ ] **Step 7: Implement intent handlers and EntityPrefetchLink lifecycle**

Store the 150ms timer and a `promoted` ref inside `EntityPrefetchLink`. Pointer enter schedules low prefetch, pointer leave/unmount cancels the pending timer, focus invokes low prefetch immediately, and pointerdown/click call the same one-shot `promoteEntity` callback. Preserve data-saver behavior for hover while allowing explicit click promotion in every mode.

- [ ] **Step 8: Verify Task 1 and commit**

Run:

```powershell
npm.cmd run test -w @gal-toolbox/web -- src/queries.test.ts src/components.test.tsx
npm.cmd run typecheck -w @gal-toolbox/web
git diff --check
```

Commit:

```powershell
git add apps/web/src/api.ts apps/web/src/queries.ts apps/web/src/queries.test.ts apps/web/src/components.tsx apps/web/src/components.test.tsx
git commit -m "fix(web): promote clicked details and bound prefetch"
```

---

### Task 2: Return Explicit Timeout Errors and Stop Retry Amplification

**Files:**
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/app.test.ts`
- Modify: `apps/api/src/openapi.ts`
- Modify: `apps/api/src/openapi.test.ts`
- Modify: `apps/web/src/query-client.ts`
- Modify: `apps/web/src/query-client.test.ts`

**Interfaces:**
- Produces: BFF TimeoutError response `{ error: { code: "UPSTREAM_TIMEOUT", message, requestId } }` with HTTP 504.
- Produces: `shouldRetryQuery(failureCount, error)` returns false for 504/429/cancellation and permits only failure count 0 for other retryable errors.

- [ ] **Step 1: Write failing API and OpenAPI timeout tests**

Use `createTestApp` with a fetcher that rejects a real `DOMException("timed out", "TimeoutError")` and assert:

```ts
expect(response.statusCode).toBe(504);
expect(response.json()).toMatchObject({
  error: { code: "UPSTREAM_TIMEOUT", requestId: expect.any(String) },
});
expect(openApiDocument.paths["/characters/{id}"].get.responses).toHaveProperty("504");
```

- [ ] **Step 2: Run API tests and verify RED**

Run: `npm.cmd run test -w @gal-toolbox/api -- src/app.test.ts src/openapi.test.ts`

Expected: FAIL with current status 500 and missing 504 response documentation.

- [ ] **Step 3: Implement 504 mapping and OpenAPI response entries**

Handle `error.name === "TimeoutError"` before the generic 500 branch in `app.setErrorHandler`. Return `UPSTREAM_TIMEOUT` with a concise Chinese message and request ID. Add `"504": errorResponse` to every VNDB-backed path response so search, detail, and relation endpoints share the same contract.

- [ ] **Step 4: Run API tests and verify GREEN**

Run: `npm.cmd run test -w @gal-toolbox/api -- src/app.test.ts src/openapi.test.ts`

Expected: all focused API tests PASS.

- [ ] **Step 5: Write failing retry-policy tests**

Add literal cases:

```ts
expect(shouldRetryQuery(0, new ApiError("timeout", 504, "UPSTREAM_TIMEOUT"))).toBe(false);
expect(shouldRetryQuery(0, new ApiError("rate", 429, "UPSTREAM_RATE_LIMITED"))).toBe(false);
expect(shouldRetryQuery(0, new ApiError("upstream", 502, "UPSTREAM_UNAVAILABLE"))).toBe(true);
expect(shouldRetryQuery(1, new ApiError("upstream", 502, "UPSTREAM_UNAVAILABLE"))).toBe(false);
```

- [ ] **Step 6: Run retry tests and verify RED**

Run: `npm.cmd run test -w @gal-toolbox/web -- src/query-client.test.ts`

Expected: FAIL because 504 currently retries and a second ordinary failure is still retryable.

- [ ] **Step 7: Implement the bounded retry policy**

Keep cancellation guards first, reject retry for statuses 429 and 504, and change the remaining condition from `count < 2` to `count < 1`.

- [ ] **Step 8: Run all automated verification and commit**

Run:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
git diff --check
```

Commit:

```powershell
git add apps/api/src/app.ts apps/api/src/app.test.ts apps/api/src/openapi.ts apps/api/src/openapi.test.ts apps/web/src/query-client.ts apps/web/src/query-client.test.ts
git commit -m "fix: bound VNDB timeout retries"
```

---

### Final Acceptance and Integration

- [ ] Run the production BFF and web build on port 8787.
- [ ] With a cold character card, confirm hover waits 150ms and sends low; pointerdown/click sends one high request; the page navigates correctly and the BFF logs show the shared task promoted without a duplicate VNDB execution.
- [ ] Repeat the core interaction at 390px and confirm no console error or horizontal overflow.
- [ ] Run `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run build`, `git diff --check`, and `git status --short` on final HEAD.
- [ ] Update `docs/project-summary.md`, push `dev`, update/create the dev→main PR, wait for required checks, and merge the PR remotely without deleting the persistent `dev` branch.
