# Buffered Prefetch and Chinese Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep one 12-item page visible while buffering the next page, prefetch entity details and images on navigation intent, and add Chinese-first Tag display plus Chinese Tag search.

**Architecture:** Preserve the public page/pageSize API and separate loaded pages from visible pages in a reusable frontend hook. Centralize React Query option builders so route queries and intent prefetch share keys. Generate a compact CC BY 4.0 Tag translation module from VNDB Profile Search and apply it at the API DTO boundary, with local Chinese search and English fallback.

**Tech Stack:** React 19, TypeScript 5.9, TanStack React Query 5, React Router 7, Fastify 5, Node 22, Vitest 4, VNDB Kana API.

## Global Constraints

- Public list endpoints retain `pageSize=12`; buffering is invisible to API consumers.
- One reveal action adds at most one page.
- Existing visual-cabinet styling remains; no new UI framework or animation dependency.
- Intent prefetch supports `pointerenter`, `focus`, and `pointerdown`.
- Prefetch errors remain silent; route-level errors remain visible.
- Tag names are Simplified Chinese first, English second, with per-entry English fallback.
- Translation attribution is “VNDB Profile Search contributors” under CC BY 4.0.
- No Service Worker, image proxy, permanent image mirror, Trait localization, or persistent React Query storage.

---

### Task 1: Generated Chinese Tag Translation Boundary

**Files:**
- Create: `scripts/tag-translation-generator.mjs`
- Create: `scripts/tag-translation-generator.test.mjs`
- Create: `scripts/sync-tag-translations.mjs`
- Create: `apps/api/src/tag-translations.generated.ts`
- Create: `apps/api/src/tag-localization.ts`
- Create: `apps/api/src/tag-localization.test.ts`
- Modify: `apps/api/src/vndb.ts`
- Modify: `apps/api/src/vndb.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `TagTranslation = { en: string; zhHans: string }`.
- Produces: `TAG_TRANSLATIONS: Readonly<Record<string, TagTranslation>>`.
- Produces: `localizeTagName(id: string, english: string, aliases?: string[]): EntityName`.
- Produces: `searchLocalizedTags(term: string): Array<{ id: string; en: string; zhHans: string }>`.
- Consumed by: VNDB Tag DTO mapping and the Chinese search route in Task 2.

- [ ] **Step 1: Write failing localization tests**

First add a Node test that exercises the generator with a complete controlled upstream fixture:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildTagTranslationModule } from "./tag-translation-generator.mjs";

test("decodes and sorts valid Tag translations while rejecting unrelated entries", () => {
  const source = {
    tags: {
      19: {
        vndbId: "g19",
        en: Buffer.from("Mystery").toString("base64"),
        zh: Buffer.from("悬疑").toString("base64"),
        enEncoded: true,
        zhEncoded: true,
      },
      broken: { vndbId: "i1", en: "Trait", zh: "特征" },
    },
  };
  const output = buildTagTranslationModule(source, "abc123");
  assert.match(output, /source commit: abc123/);
  assert.match(output, /"g19": \{ en: "Mystery", zhHans: "悬疑" \}/);
  assert.doesNotMatch(output, /"i1"/);
});
```

Then add API tests that define Chinese priority, English fallback, deduplication, and search ordering:

```ts
import { describe, expect, it } from "vitest";
import { localizeTagName, searchLocalizedTags } from "./tag-localization.js";

describe("Tag localization", () => {
  it("uses Simplified Chinese as primary and preserves English", () => {
    expect(localizeTagName("g19", "Mystery", ["Mysteries"])).toEqual({
      primary: "悬疑",
      original: "Mystery",
      romanized: null,
      alternatives: ["Mysteries"],
    });
  });

  it("falls back to VNDB English when a translation is missing", () => {
    expect(localizeTagName("g999999", "Untranslated", [])).toMatchObject({
      primary: "Untranslated",
      original: null,
    });
  });

  it("orders exact Chinese matches before prefix and substring matches", () => {
    const ids = searchLocalizedTags("悬疑").slice(0, 3).map((tag) => tag.id);
    expect(ids[0]).toBe("g19");
  });
});
```

Extend `vndb.test.ts`:

```ts
expect(mapTagSummary({ id: "g19", name: "Mystery", aliases: ["Mysteries"] }))
  .toMatchObject({
    id: "g19",
    name: { primary: "悬疑", original: "Mystery", alternatives: ["Mysteries"] },
  });
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
npm.cmd test -w @gal-toolbox/api -- src/tag-localization.test.ts src/vndb.test.ts
node --test scripts/tag-translation-generator.test.mjs
```

Expected: FAIL because the generator and localization modules do not exist and `mapTagSummary` still returns English primary.

- [ ] **Step 3: Add the sync script and package command**

Implement `buildTagTranslationModule(source, sourceCommit)` in `scripts/tag-translation-generator.mjs`; keep all decoding, validation, filtering, sorting, and source generation in that pure function.

Implement `scripts/sync-tag-translations.mjs` as the network/file wrapper that:

1. Download `public/data/vndb-meta-translations.json` from the default branch of `JodieRuth/VNDB-Profile-Search`.
2. Validate that `tags` is an object.
3. Pass the parsed response and fetched source commit to `buildTagTranslationModule`.
4. Write to a temporary sibling and rename it only after the complete module is ready.

`buildTagTranslationModule` must decode `en` and `zh` with `Buffer.from(value, "base64").toString("utf8")` when the corresponding encoded flag is true, keep only `g` entries with non-empty names, sort numerically by ID suffix, and emit the source repository, commit, attribution, type, and immutable record.

Add to the root package scripts:

```json
"sync:tag-translations": "node scripts/sync-tag-translations.mjs",
"test:tag-translations": "node --test scripts/tag-translation-generator.test.mjs",
"test": "npm run test:tag-translations && npm run test -w @gal-toolbox/api && npm run test -w @gal-toolbox/web"
```

Run:

```powershell
npm.cmd run sync:tag-translations
```

Expected: generated module contains `g19: { en: "Mystery", zhHans: "悬疑" }`.

- [ ] **Step 4: Implement minimal localization functions**

Implement `localizeTagName` using the generated record and existing string deduplication semantics. Implement `searchLocalizedTags` with normalized lowercase matching and scores:

```ts
const score = (value: string, term: string) =>
  value === term ? 0 : value.startsWith(term) ? 1 : value.includes(term) ? 2 : 3;
```

Discard score 3, sort by best Chinese/English score, then English name, then numeric VNDB ID.

Change `mapTagSummary` to call `localizeTagName(tag.id, tag.name, tag.aliases)`.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
npm.cmd test -w @gal-toolbox/api -- src/tag-localization.test.ts src/vndb.test.ts
npm.cmd run test:tag-translations
```

Expected: both test files pass.

- [ ] **Step 6: Commit Task 1**

```powershell
git add package.json scripts/tag-translation-generator.mjs scripts/tag-translation-generator.test.mjs scripts/sync-tag-translations.mjs apps/api/src/tag-translations.generated.ts apps/api/src/tag-localization.ts apps/api/src/tag-localization.test.ts apps/api/src/vndb.ts apps/api/src/vndb.test.ts
git commit -m "feat: add generated Chinese Tag localization"
```

---

### Task 2: Chinese Tag Search and HTTP Cache Headers

**Files:**
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/app.test.ts`
- Modify: `apps/api/src/openapi.ts`
- Modify: `apps/api/src/openapi.test.ts`
- Modify: `docs/api-contract.md`

**Interfaces:**
- Consumes: `searchLocalizedTags(term)` from Task 1.
- Produces: Chinese Tag search through the existing `GET /api/v1/search?type=tag` endpoint.
- Produces: list response cache policy `public, max-age=60`.
- Produces: detail response cache policy `public, max-age=300`.

- [ ] **Step 1: Write failing API behavior tests**

Extract the existing temporary app setup in `app.test.ts` into this test-only helper:

```ts
async function createTestApp(fetcher: typeof fetch) {
  const directory = mkdtempSync(join(tmpdir(), "gal-toolbox-app-"));
  const cache = new CacheStore(join(directory, "cache.sqlite"));
  const app = await buildApp({ cache, client: new VndbClient(cache, fetcher, 0) });
  cleanup.push(
    async () => app.close(),
    () => cache.close(),
    () => rmSync(directory, { recursive: true, force: true }),
  );
  return app;
}
```

Add an integration test with an external VNDB fetcher that throws if called:

```ts
it("searches translated Tags locally and caches list responses for one minute", async () => {
  const app = await createTestApp(async () => {
    throw new Error("VNDB must not be called for Chinese Tag search");
  });
  const response = await app.inject({
    method: "GET",
    url: "/api/v1/search?type=tag&q=悬疑&page=1&pageSize=12",
  });
  expect(response.statusCode).toBe(200);
  expect(response.headers["cache-control"]).toBe("public, max-age=60");
  expect(response.json()).toMatchObject({
    items: [{ id: "g19", name: { primary: "悬疑", original: "Mystery" } }],
    page: 1,
    pageSize: 12,
  });
});
```

Add assertions to existing detail and pagination tests:

```ts
expect(tag.headers["cache-control"]).toBe("public, max-age=300");
expect(novels.headers["cache-control"]).toBe("public, max-age=60");
```

- [ ] **Step 2: Run the API test and verify RED**

Run:

```powershell
npm.cmd test -w @gal-toolbox/api -- src/app.test.ts
```

Expected: FAIL because Chinese Tag search still calls VNDB and business endpoints do not set these cache headers.

- [ ] **Step 3: Implement local Chinese search and cache policies**

Add:

```ts
const containsHan = (value: string) => /[\u3400-\u9fff]/u.test(value);
const setPublicCache = (reply: FastifyReply, seconds: number) =>
  reply.header("Cache-Control", `public, max-age=${seconds}`);
```

In the search route, when `type === "tag" && containsHan(term)`:

1. Read all matches from `searchLocalizedTags(term)`.
2. Slice using `(page - 1) * pageSize`.
3. Map each match to an `EntitySummary` with Chinese primary and English original.
4. Set `X-Cache: LOCAL` and `Cache-Control: public, max-age=60`.
5. Return without calling VNDB.

Set list cache policy on search, staff characters, and Tag VNs. Set detail cache policy on VN, character, staff, and Tag routes.

- [ ] **Step 4: Update OpenAPI and contract docs**

Document that Tag search accepts localized Chinese names, names may have Chinese `primary` and English `original`, `X-Cache` may be `LOCAL`, and responses use the two cache policies. Increment OpenAPI info version from `1.1.0` to `1.2.0`.

Update `openapi.test.ts`:

```ts
expect(openApiDocument.info.version).toBe("1.2.0");
expect(openApiDocument.paths["/search"].get.description).toContain("Chinese");
```

- [ ] **Step 5: Run focused API tests and verify GREEN**

Run:

```powershell
npm.cmd test -w @gal-toolbox/api -- src/app.test.ts src/openapi.test.ts
```

Expected: both test files pass.

- [ ] **Step 6: Commit Task 2**

```powershell
git add apps/api/src/app.ts apps/api/src/app.test.ts apps/api/src/openapi.ts apps/api/src/openapi.test.ts docs/api-contract.md
git commit -m "feat: support Chinese Tag search and HTTP caching"
```

---

### Task 3: Shared Query Options and Intent Prefetch

**Files:**
- Create: `apps/web/src/query-client.ts`
- Create: `apps/web/src/queries.ts`
- Create: `apps/web/src/queries.test.ts`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/src/components.tsx`
- Modify: `apps/web/src/pages/VnPage.tsx`
- Modify: `apps/web/src/pages/CharacterPage.tsx`
- Modify: `apps/web/src/pages/StaffPage.tsx`
- Modify: `apps/web/src/pages/TagPage.tsx`
- Modify: `apps/web/index.html`

**Interfaces:**
- Produces option builders `vnQuery`, `characterQuery`, `staffQuery`, `staffCharactersQuery`, `tagQuery`, and `tagVnsQuery`.
- Produces `prefetchEntity(queryClient: QueryClient, entity: EntitySummary, preload?: (url: string) => void): Promise<void>`.
- EntityCard consumes the current QueryClient and calls the same prefetch function from three intent events.

- [ ] **Step 1: Write failing intent-prefetch tests**

Use a real QueryClient and a stubbed global fetch:

```ts
it("deduplicates concurrent VN intent prefetch and preloads returned images", async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const fetcher = vi.fn(async () => new Response(JSON.stringify(vnDetailFixture)));
  vi.stubGlobal("fetch", fetcher);
  const preload = vi.fn();
  const entity = vnDetailFixture.entity;

  await Promise.all([
    prefetchEntity(queryClient, entity, preload),
    prefetchEntity(queryClient, entity, preload),
  ]);

  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(queryClient.getQueryData(["vn", entity.id])).toEqual(vnDetailFixture);
  expect(preload).toHaveBeenCalledWith(entity.image.thumbnailUrl);
});
```

Add a Tag case asserting that detail and first VN page are cached under `["tag", id]` and `["tag-vns", id]`.

- [ ] **Step 2: Run the query test and verify RED**

Run:

```powershell
npm.cmd test -w @gal-toolbox/web -- src/queries.test.ts
```

Expected: FAIL because `queries.ts` and `prefetchEntity` do not exist.

- [ ] **Step 3: Implement shared query options and prefetch**

Build all query options from the existing API functions. For infinite queries use:

```ts
infiniteQueryOptions({
  queryKey: ["tag-vns", id],
  queryFn: ({ pageParam }) => getTagVns(id, pageParam),
  initialPageParam: 1,
  getNextPageParam: (lastPage) => lastPage.more ? lastPage.page + 1 : undefined,
});
```

Implement `prefetchEntity` with:

- `prefetchQuery` for VN and Character.
- `Promise.all([prefetchQuery, prefetchInfiniteQuery])` for Staff and Tag.
- image preload after the returned detail/list data is available.
- `catch(() => undefined)` at the outer intent boundary so prefetch failures stay silent.

Move the existing QueryClient construction from `main.tsx` into `query-client.ts` as `export const queryClient = new QueryClient(...)`; import that instance back into `main.tsx`. Keep `prefetchEntity` parameterized with a QueryClient so tests use an isolated instance.

- [ ] **Step 4: Wire route queries and card intent events**

Replace inline page query definitions with the option builders. In `EntityCard`, use `useQueryClient()` and attach:

```tsx
onPointerEnter={prefetch}
onFocus={prefetch}
onPointerDown={prefetch}
```

Keep the Link as the navigation control and do not add hover-only UI.

Add to `apps/web/index.html`:

```html
<link rel="preconnect" href="https://t.vndb.org" crossorigin />
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
npm.cmd test -w @gal-toolbox/web -- src/queries.test.ts src/api.test.ts
```

Expected: both test files pass with one fetch for duplicate VN intent.

- [ ] **Step 6: Commit Task 3**

```powershell
git add apps/web/src/query-client.ts apps/web/src/queries.ts apps/web/src/queries.test.ts apps/web/src/main.tsx apps/web/src/components.tsx apps/web/src/pages/VnPage.tsx apps/web/src/pages/CharacterPage.tsx apps/web/src/pages/StaffPage.tsx apps/web/src/pages/TagPage.tsx apps/web/index.html
git commit -m "feat: prefetch entity details on navigation intent"
```

---

### Task 4: One-Visible-One-Buffered Pagination

**Files:**
- Create: `apps/web/src/buffered-pages.ts`
- Create: `apps/web/src/buffered-pages.test.ts`
- Modify: `apps/web/src/pages/SearchPage.tsx`
- Modify: `apps/web/src/pages/StaffPage.tsx`
- Modify: `apps/web/src/pages/TagPage.tsx`
- Modify: `apps/web/src/components.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Produces `useBufferedPages<T>({ scope, pages, hasNextPage, isFetchingNextPage, fetchNextPage })`.
- Returns `items`, `hasBufferedPage`, `canRevealNextPage`, `isWaitingForBuffer`, and `revealNextPage`.
- AutoPageLoader consumes buffer-aware flags and calls only `revealNextPage`.

- [ ] **Step 1: Write failing reducer and selector tests**

```ts
it("keeps the second loaded page hidden until one reveal", () => {
  const pages = [page(["a", "b"], 1, true), page(["c", "d"], 2, true)];
  expect(selectVisibleItems(pages, 1)).toEqual(["a", "b"]);
  expect(hasBufferedPage(pages, 1)).toBe(true);
  expect(reduceBufferedPage({ scope: "q", visiblePageCount: 1 }, { type: "reveal", loadedPageCount: 2 }))
    .toEqual({ scope: "q", visiblePageCount: 2 });
});

it("reveals at most one page and resets when scope changes", () => {
  const state = reduceBufferedPage(
    { scope: "old", visiblePageCount: 3 },
    { type: "sync-scope", scope: "new" },
  );
  expect(state).toEqual({ scope: "new", visiblePageCount: 1 });
});

it("requests a buffer only when no hidden loaded page exists", () => {
  expect(shouldFetchBuffer({
    loadedPageCount: 1,
    visiblePageCount: 1,
    hasNextPage: true,
    isFetchingNextPage: false,
  })).toBe(true);
});
```

- [ ] **Step 2: Run the pagination test and verify RED**

Run:

```powershell
npm.cmd test -w @gal-toolbox/web -- src/buffered-pages.test.ts
```

Expected: FAIL because the buffered pagination module does not exist.

- [ ] **Step 3: Implement the pure state machine and hook**

Implement:

```ts
export function selectVisibleItems<T>(pages: Array<Page<T>>, visiblePageCount: number): T[] {
  return pages.slice(0, visiblePageCount).flatMap((page) => page.items);
}
```

The reducer's reveal action uses `Math.min(current + 1, loadedPageCount)`. The hook runs a guarded effect that calls `fetchNextPage` only when `shouldFetchBuffer` is true. `revealNextPage` reveals a loaded buffer immediately; if none exists, it awaits one fetch and then dispatches one reveal.

- [ ] **Step 4: Integrate all three infinite lists**

Use stable scopes:

- Search: `search:${type}:${query}`.
- Staff: `staff:${id}`.
- Tag: `tag:${id}`.

Render only `buffered.items`. Change loader copy:

- Buffer exists: “下一页已准备好”.
- Fetching without buffer: “正在准备下一页…”.
- Manual fallback: “继续浏览”.

Keep the existing 600px root margin and accessible button.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
npm.cmd test -w @gal-toolbox/web -- src/buffered-pages.test.ts src/queries.test.ts src/api.test.ts
```

Expected: all three test files pass.

- [ ] **Step 6: Commit Task 4**

```powershell
git add apps/web/src/buffered-pages.ts apps/web/src/buffered-pages.test.ts apps/web/src/pages/SearchPage.tsx apps/web/src/pages/StaffPage.tsx apps/web/src/pages/TagPage.tsx apps/web/src/components.tsx apps/web/src/styles.css
git commit -m "feat: buffer one hidden page ahead"
```

---

### Task 5: Chinese Tag Presentation and Attribution

**Files:**
- Create: `apps/web/src/tag-label.ts`
- Create: `apps/web/src/tag-label.test.ts`
- Modify: `apps/web/src/pages/VnPage.tsx`
- Modify: `apps/web/src/pages/TagPage.tsx`
- Modify: `apps/web/src/components.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`
- Create: `THIRD_PARTY_NOTICES.md`
- Modify: `README.md`
- Modify: `docs/performance-tags-openapi-spec.md`

**Interfaces:**
- Consumes: localized `EntityName` returned by the API.
- Produces: Chinese primary Tag labels with English secondary labels.
- Produces: visible and repository-level CC BY 4.0 attribution.

- [ ] **Step 1: Write a failing formatting test**

Create and test `getSecondaryName(name: EntityName): string | null` in `tag-label.ts`:

```ts
expect(getSecondaryName({
  primary: "悬疑",
  original: "Mystery",
  romanized: null,
  alternatives: [],
})).toBe("Mystery");

expect(getSecondaryName({
  primary: "Untranslated",
  original: null,
  romanized: null,
  alternatives: [],
})).toBeNull();
```

- [ ] **Step 2: Run the web formatting test and verify RED**

Run:

```powershell
npm.cmd test -w @gal-toolbox/web -- src/tag-label.test.ts
```

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement Chinese-first Tag UI**

- Use the shared name block to render Chinese primary and English original on Tag cards and Tag detail.
- In the VN Tag cloud, render Chinese text as the main span and English as a compact secondary label only when different.
- Replace copy that says Chinese translation is future work with “中文来自 VNDB Profile Search，英文保留用于定位。”
- Keep the existing rating number and responsive wrapping.

- [ ] **Step 4: Add attribution**

Create `THIRD_PARTY_NOTICES.md` containing:

- Source repository URL.
- “VNDB Profile Search contributors”.
- CC BY 4.0 URL.
- The statement that only project-authored Tag/Trait translation text is used under this license.
- Existing VNDB database and image license caveats.

Add a footer link labeled “Tag 中文：VNDB Profile Search ↗” to the source repository, and update README/data license sections.

- [ ] **Step 5: Run the formatting test and verify GREEN**

Run:

```powershell
npm.cmd test -w @gal-toolbox/web -- src/tag-label.test.ts
```

Expected: test passes.

- [ ] **Step 6: Commit Task 5**

```powershell
git add apps/web/src/pages/VnPage.tsx apps/web/src/pages/TagPage.tsx apps/web/src/components.tsx apps/web/src/App.tsx apps/web/src/styles.css apps/web/src/tag-label.ts apps/web/src/tag-label.test.ts THIRD_PARTY_NOTICES.md README.md docs/performance-tags-openapi-spec.md
git commit -m "feat: present Chinese Tags with attribution"
```

---

### Task 6: Full Verification, Browser Evidence, and Project Memory

**Files:**
- Modify: `docs/project-summary.md`
- Modify: `docs/superpowers/plans/2026-08-10-buffered-prefetch-chinese-tags.md` (check completed boxes during execution)

**Interfaces:**
- Consumes all prior tasks.
- Produces durable validation evidence and handoff notes.

- [ ] **Step 1: Run the complete automated verification**

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd audit --audit-level=high
git diff --check
```

Expected: every command exits 0; Vitest reports 0 failed tests; audit reports 0 high-severity vulnerabilities.

- [ ] **Step 2: Verify the real API**

Request:

```text
GET /api/v1/search?type=tag&q=悬疑&page=1&pageSize=12
GET /api/v1/tags/g19
GET /api/v1/tags/g19/vns?page=1&pageSize=12
GET /api/v1/openapi.json
```

Assert:

- Search returns `g19` with primary `悬疑` and original `Mystery`.
- Detail returns `Cache-Control: public, max-age=300`.
- Tag VN page returns `Cache-Control: public, max-age=60`.
- OpenAPI version is `1.2.0`.

- [ ] **Step 3: Verify buffered paging in Playwright**

Use a fresh named Playwright CLI session. Open a Tag with more than 36 VNs and inspect requests plus DOM:

1. After initial settle, requests contain page 1 and page 2.
2. Snapshot contains exactly 12 result cards.
3. Scroll near the loader.
4. Snapshot contains exactly 24 result cards.
5. Requests now contain page 3.
6. A single scroll/reveal never jumps directly from 12 to 36.

- [ ] **Step 4: Verify intent prefetch in Playwright**

On a search result:

1. Clear session request history by opening a fresh page.
2. Hover a VN card and confirm its detail API request occurs before click.
3. Click the card and confirm no second network request is made for the same detail during its 5-minute stale window.
4. Repeat with keyboard focus on a Tag card.

- [ ] **Step 5: Verify Chinese Tag UI and responsive behavior**

- Search for `悬疑`.
- Follow `悬疑 → 时空轮回 → 中文 Tag → VN`.
- Capture desktop and 390×844 screenshots under `output/playwright/buffered-prefetch-tags/`.
- Confirm English secondary labels do not overflow and console reports 0 errors.

- [ ] **Step 6: Update project summary**

Record:

- Buffered one-visible/one-hidden page behavior.
- Intent event coverage.
- HTTP, React Query, SQLite, and CDN cache layers.
- Translation source commit, attribution, update command, and fallback behavior.
- Commands and browser evidence.
- Remaining work: real-user performance measurement, Service Worker/image proxy evaluation, and Trait localization.

- [ ] **Step 7: Commit verification documentation**

```powershell
git add docs/project-summary.md docs/superpowers/plans/2026-08-10-buffered-prefetch-chinese-tags.md
git commit -m "docs: record prefetch and localization validation"
```

- [ ] **Step 8: Push and restore GitHub account**

Switch to `Minyaako`, push `main`, and restore `li8034` even if push fails:

```powershell
gh auth switch -u Minyaako
try { git push origin main } finally { gh auth switch -u li8034 }
```

Confirm `git status --short` is empty and the remote contains the final commit.
