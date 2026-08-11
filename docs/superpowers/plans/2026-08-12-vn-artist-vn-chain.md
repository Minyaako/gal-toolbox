# VN Artist VN Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a parallel `VN → artist → VN` exploration chain backed by VNDB `art` and `chardesign` staff credits without changing the existing voice-actor chain.

**Architecture:** The Fastify BFF normalizes VNDB staff credits into explicit artist relation DTOs, merges duplicate staff/VN records, and publishes two artist endpoints plus the extended VN contract. The React client keeps artist semantics outside `EntityType`: dedicated routes, query keys, prefetch/promotion functions, and trail paths reuse the Staff profile shape while keeping artist and voice-actor contexts isolated.

**Tech Stack:** Node.js 22.5+, TypeScript 5.9, Fastify 5, VNDB Kana API, SQLite cache, React 19, React Router 7, TanStack React Query 5, Vitest 4, happy-dom, Vite 7.

## Global Constraints

- Keep `EntityType` exactly `"vn" | "character" | "staff" | "tag"`; artist summaries retain `type: "staff"`.
- Accept only VNDB staff roles `art` and `chardesign`; exclude `scenario`, `director`, `music`, `songs`, `translator`, `editor`, `qa`, and every other staff role.
- Normalize blank notes to `null`, clean nonblank notes with `cleanVndbText()`, deduplicate credits by `(role, cleanedNote)`, and order credits as `art` then `chardesign`.
- Keep one artist relation per Staff ID in a VN detail and one work card per VN ID in an artist work page.
- Keep existing `/knowledge/staff/:id` and `/staff/:id` voice-actor behavior unchanged.
- Use 24-hour SQLite entity TTL and `Cache-Control: public, max-age=300` for artist details; use 12-hour SQLite relation TTL and `Cache-Control: public, max-age=60` for artist work pages.
- Preserve request priority, cancellation, `X-Cache`, `X-Request-Priority`, `Server-Timing`, stale-cache fallback, page size 12, and the one-visible-page/one-buffered-page contract.
- Do not add an artist search type, character-level artist mapping, image proxy, artist avatar source, cache backend, or dependency.

---

### Task 1: API DTOs, handlers, OpenAPI, and contract documentation

**Files:**
- Modify: `apps/api/src/types.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/app.test.ts`
- Modify: `apps/api/src/openapi.ts`
- Test: `apps/api/src/openapi.test.ts`
- Modify: `docs/api-contract.md`

**Interfaces:**
- Produces: `ArtistRole = "art" | "chardesign"`.
- Produces: `ArtistCredit = { role: ArtistRole; note: string | null }`.
- Produces: `ArtistRelation = { staff: EntitySummary; credits: ArtistCredit[] }`.
- Produces: `ArtistWork = { vn: EntitySummary; credits: ArtistCredit[] }`.
- Produces: `GET /api/v1/vns/:id` with required `artists: ArtistRelation[]` in addition to every existing field.
- Produces: `GET /api/v1/artists/:id` with the exact Staff detail response shape `{ entity, description, language, aliases, externalLinks }`.
- Produces: `GET /api/v1/artists/:id/vns?page=1&pageSize=12` returning `Page<ArtistWork>` sorted by VNDB rating descending.
- Produces: OpenAPI `info.version: "1.3.0"`, `Artists` tag, artist paths, and `ArtistCredit`, `ArtistRelation`, `ArtistWork`, `ArtistWorkPage` schemas.

- [ ] **Step 1: Write failing BFF contract tests for VN artist merging and the two artist endpoints**

Extend `apps/api/src/app.test.ts` with a fetcher that records parsed VNDB bodies and returns these deterministic fixtures:

```ts
const v17 = {
  id: "v17",
  title: "Ever17",
  titles: [],
  aliases: [],
  image: null,
  staff: [
    { id: "s1928", name: "Artist A", original: "画师A", aliases: [], role: "chardesign", note: " [b]Main cast[/b] " },
    { id: "s1928", name: "Artist A", original: "画师A", aliases: [], role: "art", note: "   " },
    { id: "s1928", name: "Artist A", original: "画师A", aliases: [], role: "art", note: null },
    { id: "s223", name: "Artist B", original: "画师B", aliases: [], role: "art", note: "[i]Character sprites, BG[/i]" },
    { id: "s999", name: "Director", original: null, aliases: [], role: "director", note: "Ignored" },
  ],
};

expect(vnResponse.json().artists).toEqual([
  {
    staff: expect.objectContaining({ id: "s1928", type: "staff" }),
    credits: [
      { role: "art", note: null },
      { role: "chardesign", note: "Main cast" },
    ],
  },
  {
    staff: expect.objectContaining({ id: "s223", type: "staff" }),
    credits: [{ role: "art", note: "Character sprites, BG" }],
  },
]);
```

For `/api/v1/artists/s1928`, assert status 200, `Cache-Control: public, max-age=300`, `entity.type === "staff"`, cleaned description, language, aliases, and external links. For `/api/v1/artists/s1928/vns?page=2&pageSize=12`, return two raw `v17` rows with mixed target/non-target staff credits and assert one merged work, target Staff filtering, `art` before `chardesign`, cleaned notes, `page: 2`, `pageSize: 12`, `more`, and `Cache-Control: public, max-age=60`.

Assert the recorded artist-work VNDB body exactly contains:

```ts
expect(workBody).toMatchObject({
  filters: [
    "staff",
    "=",
    [
      "and",
      ["id", "=", "s1928"],
      ["or", ["role", "=", "art"], ["role", "=", "chardesign"]],
    ],
  ],
  sort: "rating",
  reverse: true,
  results: 12,
  page: 2,
});
expect(workBody.fields).toContain("staff{role,note");
```

- [ ] **Step 2: Run the focused BFF tests and verify RED**

Run:

```powershell
npm.cmd run test -w @gal-toolbox/api -- src/app.test.ts
```

Expected: FAIL because `VnDetail.artists` and both `/api/v1/artists/*` routes are absent.

- [ ] **Step 3: Add artist DTOs and deterministic credit normalization**

Add the four exported DTOs to `apps/api/src/types.ts`. In `apps/api/src/app.ts`, extend the VN raw shape with flattened VNDB staff credits and add focused helpers with these signatures:

```ts
type RawArtistCredit = RawStaff & {
  role: string;
  note?: string | null;
};

const ARTIST_ROLE_ORDER: Record<ArtistRole, number> = {
  art: 0,
  chardesign: 1,
};

function normalizeArtistCredits(
  credits: RawArtistCredit[],
  staffId?: string,
): ArtistCredit[];

function mapArtistRelations(credits: RawArtistCredit[]): ArtistRelation[];

function mapArtistWorks(
  novels: Array<RawVn & { staff?: RawArtistCredit[] }>,
  staffId: string,
): ArtistWork[];
```

`normalizeArtistCredits()` filters by the optional target ID and the two accepted roles, computes `const note = cleanVndbText(item.note) || null`, deduplicates with a key containing role and normalized note, and sorts by `ARTIST_ROLE_ORDER`. `mapArtistRelations()` uses insertion-ordered `Map<string, ArtistRelation>` grouping by `staff.id`; `mapArtistWorks()` uses insertion-ordered `Map<string, ArtistWork>` grouping by `vn.id` and merges credits across duplicate raw VN rows.

- [ ] **Step 4: Implement the minimal Fastify handlers through the existing scheduling wrapper**

Extend the `/api/v1/vns/:id` fields with:

```ts
`staff{role,note,${fields.staffSummary}}`
```

and add `artists: mapArtistRelations(vn.staff ?? [])` to its response without changing its current route, cast, tag, relation, error, or TTL behavior.

Extract the existing Staff response mapping into:

```ts
function mapStaffDetail(staff: RawStaffDetail) {
  return {
    entity: mapStaffSummary(staff),
    description: cleanVndbText(staff.description),
    language: staff.lang ?? null,
    aliases: staff.aliases ?? [],
    externalLinks: staff.extlinks ?? [],
  };
}
```

Use that helper in both the unchanged `/api/v1/staff/:id` handler and the new `/api/v1/artists/:id` handler. The artist detail route validates the `s` prefix, queries `/staff` with `['and', ['id', '=', id], ['ismain', '=', 1]]`, requests `fields.staffSummary,description,lang,extlinks{url,label}`, uses `ENTITY_TTL`, returns a 404 `NOT_FOUND` error for an absent record, and sets public cache to 300 seconds.

Implement the work handler body exactly as:

```ts
{
  filters: [
    "staff",
    "=",
    [
      "and",
      ["id", "=", request.params.id],
      ["or", ["role", "=", "art"], ["role", "=", "chardesign"]],
    ],
  ],
  fields: `${fields.vnSummary},staff{role,note,${fields.staffSummary}}`,
  sort: "rating",
  reverse: true,
  results: pageSize,
  page,
}
```

Pass the handler through `queryVndb()` with `RELATION_TTL`, set public cache to 60 seconds, and return `{ items: mapArtistWorks(...), page, pageSize, more: result.data.more }`.

- [ ] **Step 5: Run the BFF tests and verify GREEN**

Run:

```powershell
npm.cmd run test -w @gal-toolbox/api -- src/app.test.ts
npm.cmd run typecheck -w @gal-toolbox/api
```

Expected: all BFF tests PASS and TypeScript accepts the raw VNDB shapes, DTOs, merge helpers, and route responses.

- [ ] **Step 6: Write failing OpenAPI assertions**

Extend `apps/api/src/openapi.test.ts` with literal assertions:

```ts
expect(openApiDocument.info.version).toBe("1.3.0");
expect(openApiDocument.tags).toContainEqual({ name: "Artists" });
expect(openApiDocument.paths).toHaveProperty("/artists/{id}");
expect(openApiDocument.paths).toHaveProperty("/artists/{id}/vns");
expect(openApiDocument.components.schemas.VnDetail.required).toContain("artists");
expect(openApiDocument.components.schemas.ArtistCredit.required).toEqual(["role", "note"]);
expect(openApiDocument.components.schemas.ArtistRelation.required).toEqual(["staff", "credits"]);
expect(openApiDocument.components.schemas.ArtistWork.required).toEqual(["vn", "credits"]);
expect(openApiDocument.components.schemas.ArtistWorkPage.required)
  .toEqual(["items", "page", "pageSize", "more"]);
```

Add the artist paths to the existing timeout-response loop and assert that detail documents 300-second cache semantics in its description while works document 60-second cache semantics and pagination parameters.

- [ ] **Step 7: Run the OpenAPI tests and verify RED**

Run:

```powershell
npm.cmd run test -w @gal-toolbox/api -- src/openapi.test.ts
```

Expected: FAIL on version `1.2.0`, missing `Artists`, missing paths, and missing schemas.

- [ ] **Step 8: Publish OpenAPI 1.3.0 and update the human contract**

In `apps/api/src/openapi.ts`, add `Artists`, both operations with `priorityParameter`, `s`-ID validation, relation pagination, scheduling headers, 404/504 responses, and these schemas:

```ts
ArtistCredit: {
  type: "object",
  required: ["role", "note"],
  properties: {
    role: { type: "string", enum: ["art", "chardesign"] },
    note: { type: ["string", "null"] },
  },
},
ArtistRelation: {
  type: "object",
  required: ["staff", "credits"],
  properties: {
    staff: { $ref: "#/components/schemas/EntitySummary" },
    credits: { type: "array", items: { $ref: "#/components/schemas/ArtistCredit" } },
  },
},
ArtistWork: {
  type: "object",
  required: ["vn", "credits"],
  properties: {
    vn: { $ref: "#/components/schemas/EntitySummary" },
    credits: { type: "array", items: { $ref: "#/components/schemas/ArtistCredit" } },
  },
},
ArtistWorkPage: {
  type: "object",
  required: ["items", "page", "pageSize", "more"],
  properties: {
    items: { type: "array", items: { $ref: "#/components/schemas/ArtistWork" } },
    page: { type: "integer" },
    pageSize: { type: "integer" },
    more: { type: "boolean" },
  },
},
```

Add `artists` to `VnDetail.required` and reference `ArtistRelation` for its items. Set `info.version` to `1.3.0`. In `docs/api-contract.md`, add the four DTOs, document `VnDetail.artists`, both artist endpoints, role labels, merge/note rules, sorting, TTL/HTTP cache values, and state explicitly that `staff.note` is a per-work/per-role credit note rather than the Staff global biography.

- [ ] **Step 9: Verify Task 1 and commit independently**

Run:

```powershell
npm.cmd run test -w @gal-toolbox/api -- src/app.test.ts src/openapi.test.ts
npm.cmd run typecheck -w @gal-toolbox/api
npm.cmd run build -w @gal-toolbox/api
git diff --check
```

Expected: every command exits 0.

Commit only Task 1 files:

```powershell
git add apps/api/src/types.ts apps/api/src/app.ts apps/api/src/app.test.ts apps/api/src/openapi.ts apps/api/src/openapi.test.ts docs/api-contract.md
git commit -m "feat(api): add artist exploration contracts"
```

---

### Task 2: Web artist route, queries, prefetch, trail, UI, and browser acceptance

**Files:**
- Modify: `apps/web/src/api.ts`
- Test: `apps/web/src/api.test.ts`
- Modify: `apps/web/src/queries.ts`
- Test: `apps/web/src/queries.test.ts`
- Modify: `apps/web/src/components.tsx`
- Test: `apps/web/src/components.test.tsx`
- Modify: `apps/web/src/app/navigation.ts`
- Modify: `apps/web/src/app/routes.tsx`
- Test: `apps/web/src/app/routes.test.tsx`
- Modify: `apps/web/src/app/RouteTransition.tsx`
- Test: `apps/web/src/app/RouteTransition.test.tsx`
- Modify: `apps/web/src/trail.tsx`
- Create: `apps/web/src/trail.test.tsx`
- Modify: `apps/web/src/pages/HomePage.tsx`
- Modify: `apps/web/src/pages/VnPage.tsx`
- Test: `apps/web/src/pages/VnPage.test.tsx`
- Create: `apps/web/src/pages/ArtistPage.tsx`
- Create: `apps/web/src/pages/ArtistPage.test.tsx`
- Modify: `apps/web/src/styles/knowledge.css`

**Interfaces:**
- Consumes from Task 1: `ArtistRole`, `ArtistCredit`, `ArtistRelation`, `ArtistWork`, `GET /artists/:id`, `GET /artists/:id/vns`, and `VnDetail.artists` with the exact shapes defined above.
- Produces: `artistPath(id: string): string` returning `/knowledge/artist/${id}` without changing `knowledgeEntityPath()`.
- Produces: `artistQuery(id, priority)` with query key `['artist', id]` and `artistVnsQuery(id, getPriority)` with key `['artist-vns', id]`.
- Produces: `prefetchArtist(queryClient, staff, preload?)` and `promoteArtist(id)` isolated from `staffQuery` and `staffCharactersQuery` caches.
- Produces: `ArtistPrefetchLink` with artist routing, 150ms hover prefetch, immediate focus prefetch, one-shot pointerdown/click high promotion, aggressive prefetch support, and unmount cancellation.
- Produces: `artistRoleLabels` and `ArtistCredits` as the single Web renderer for ordered role labels and non-null work notes.
- Produces: `visit(entity, path?)`, where omitted paths use `entityPath(entity)` and artist pages pass `artistPath(entity.id)`.
- Produces: `/knowledge/artist/:id`, legacy `/artist/:id`, document title `画师图鉴`, transition label `正在准备画师资料`, and buffered work scope `artist:${id}`.

- [ ] **Step 1: Write failing API and React Query contract tests**

In `apps/web/src/api.test.ts`, import `getArtist` and `getArtistVns`; assert exact URLs, signal identity, priority headers, and promotion suffix behavior:

```ts
await getArtist("s1928", { signal, priority: "low" });
await getArtistVns("s1928", 2, 12, { signal, priority: "high", promotion: true });

expect(fetcher).toHaveBeenNthCalledWith(1, "/api/v1/artists/s1928", expect.any(Object));
expect(fetcher).toHaveBeenNthCalledWith(
  2,
  "/api/v1/artists/s1928/vns?page=2&pageSize=12&_priorityPromotion=1",
  expect.any(Object),
);
```

In `apps/web/src/queries.test.ts`, add artist fixtures and assert:

```ts
expect(artistQuery("s1928").queryKey).toEqual(["artist", "s1928"]);
expect(artistVnsQuery("s1928").queryKey).toEqual(["artist-vns", "s1928"]);
expect(queryClient.getQueryData(["staff", "s1928"])).toBeUndefined();
expect(queryClient.getQueryData(["staff-characters", "s1928"])).toBeUndefined();
```

Exercise `prefetchArtist()` with deferred fetches and assert it stores the artist detail plus first `Page<ArtistWork>`, preloads returned VN covers, forwards `low`, and honors the existing three-active-intent budget. Exercise `promoteArtist('s1928')` while low prefetches are pending and assert two separate direct `high` promotion requests, one for detail and one for page 1 works, both carrying `_priorityPromotion=1`.

- [ ] **Step 2: Run focused query tests and verify RED**

Run:

```powershell
npm.cmd run test -w @gal-toolbox/web -- src/api.test.ts src/queries.test.ts
```

Expected: FAIL because artist DTOs, API functions, query keys, and artist prefetch/promotion functions are absent.

- [ ] **Step 3: Add exact Web DTOs, endpoint functions, and isolated artist queries**

Add to `apps/web/src/api.ts`:

```ts
export type ArtistRole = "art" | "chardesign";
export type ArtistCredit = { role: ArtistRole; note: string | null };
export type ArtistRelation = { staff: EntitySummary; credits: ArtistCredit[] };
export type ArtistWork = { vn: EntitySummary; credits: ArtistCredit[] };
export type ArtistDetail = StaffDetail;
```

Add `artists: ArtistRelation[]` to `VnDetail`, then add `getArtist(id, options)` and `getArtistVns(id, page, pageSize = 12, options)` using the exact BFF paths from Task 1.

Add to `apps/web/src/queries.ts`:

```ts
export const artistQuery = (id: string, priority: RequestPriority = "high") =>
  queryOptions({
    queryKey: ["artist", id],
    queryFn: ({ signal }) => getArtist(id, { signal, priority }),
  });

export const artistVnsQuery = (
  id: string,
  getPriority: () => RequestPriority = () => "normal",
) => infiniteQueryOptions({
  queryKey: ["artist-vns", id],
  queryFn: ({ pageParam, signal }) =>
    getArtistVns(id, pageParam, 12, { signal, priority: getPriority() }),
  initialPageParam: 1,
  getNextPageParam: (lastPage) => lastPage.more ? lastPage.page + 1 : undefined,
});
```

Implement `prefetchArtist()` with the same active-intent budget as `prefetchEntity()`, keyed `artist:${staff.id}`, using `Promise.all(prefetchQuery(artistQuery(..., 'low')), prefetchInfiniteQuery(artistVnsQuery(...)))`, and preload every first-page work cover. Implement `promoteArtist(id)` with `Promise.all(getArtist(...high promotion), getArtistVns(id, 1, 12, ...high promotion))`; swallow failures because route queries own visible errors.

- [ ] **Step 4: Run focused query tests and verify GREEN**

Run:

```powershell
npm.cmd run test -w @gal-toolbox/web -- src/api.test.ts src/queries.test.ts
npm.cmd run typecheck -w @gal-toolbox/web
```

Expected: all focused tests PASS and no artist data appears under Staff query keys.

- [ ] **Step 5: Write failing route, transition, link-intent, and trail tests**

Extend `apps/web/src/app/routes.test.tsx` to assert official and legacy matches, exact title, and redirect contract:

```ts
expect(matchRoutes(appRoutes, "/knowledge/artist/s1928")?.at(-1)?.route.path)
  .toBe("/knowledge/artist/:id");
expect(matchRoutes(appRoutes, "/artist/s1928")?.at(-1)?.route.path)
  .toBe("/artist/:id");
expect(pageTitle("/knowledge/artist/s1928")).toBe("画师图鉴");
expect(legacyRedirectContract("artist", "s1928", "?from=v17", "#works"))
  .toEqual({ replace: true, to: "/knowledge/artist/s1928?from=v17#works" });
```

Extend `apps/web/src/app/RouteTransition.test.tsx` to assert `routeLoadingLabel('/knowledge/artist/s1928') === '正在准备画师资料'` and `routeTargetIsReady()` reads `['artist', 's1928']`, not `['staff', 's1928']`.

Extend `apps/web/src/components.test.tsx` with `ArtistPrefetchLink` intent tests matching `EntityPrefetchLink`: 149ms hover does nothing, 150ms starts low detail and works prefetch, pointer leave cancels the timer, focus starts immediately, and pointerdown plus click produces only one pair of high promotion requests.

Create `apps/web/src/trail.test.tsx` around pure exported trail helpers and assert:

```ts
const voicePath = "/knowledge/staff/s1928";
const artPath = "/knowledge/artist/s1928";
const next = addTrailItem(addTrailItem([], staff, voicePath), staff, artPath);
expect(next.map((item) => item.path)).toEqual([voicePath, artPath]);
expect(normalizeTrail([staff])).toEqual([{ entity: staff, path: voicePath }]);
```

- [ ] **Step 6: Run the route/link/trail tests and verify RED**

Run:

```powershell
npm.cmd run test -w @gal-toolbox/web -- src/app/routes.test.tsx src/app/RouteTransition.test.tsx src/components.test.tsx src/trail.test.tsx
```

Expected: FAIL because the artist route context, artist intent link, and path-aware trail model are absent.

- [ ] **Step 7: Implement artist routing, readiness, prefetch links, and path-aware trail storage**

In `apps/web/src/app/navigation.ts`, add `artistPath(id)` while leaving `knowledgeEntityPath()` unchanged. In routes, extend `LegacyEntityType` with `artist`, mount `ArtistPage` at `/knowledge/artist/:id`, mount the legacy redirect at `/artist/:id`, and make the artist title branch return exactly `画师图鉴`.

In `RouteTransition.tsx`, add the artist loading label before the Staff branch and extend the route query-key matcher to `(vn|character|staff|artist|tag)`, yielding `['artist', id]` for artist paths.

In `components.tsx`, add optional `kindLabel?: string` to `NameBlock` and render it instead of the `EntityType` label when present. Add `ArtistPrefetchLink` using `artistPath()`, `prefetchArtist()`, `promoteArtist()`, and the existing `createEntityPrefetchIntent()` lifecycle; pass the Staff summary unchanged so its `type` remains `staff`. Export the exact label map and shared credit renderer:

```tsx
export const artistRoleLabels: Record<ArtistRole, string> = {
  art: "原画／美术",
  chardesign: "角色设计",
};

export function ArtistCredits({ credits }: { credits: ArtistCredit[] }) {
  return <ul className="artist-credits">
    {credits.map((credit) => <li key={`${credit.role}:${credit.note ?? ""}`}>
      <span>{artistRoleLabels[credit.role]}</span>
      {credit.note !== null ? <p>{credit.note}</p> : null}
    </li>)}
  </ul>;
}
```

In `trail.tsx`, introduce and export:

```ts
export type TrailItem = { entity: EntitySummary; path: string };

export function normalizeTrail(value: unknown): TrailItem[];

export function addTrailItem(
  current: TrailItem[],
  entity: EntitySummary,
  path: string = entityPath(entity),
): TrailItem[];
```

`normalizeTrail()` accepts both stored `TrailItem[]` and the legacy stored `EntitySummary[]`; `addTrailItem()` deduplicates by path, retains 12 entries, and therefore keeps voice and artist paths for the same Staff ID. Change `visit` to `(entity, path?)`, use `item.path` as list key and link target, and update the empty copy to include 画师. Update `HomePage` recent-trace rendering to read `latest.entity.name.primary` and link directly to `latest.path`, preserving artist context instead of rebuilding a Staff path.

- [ ] **Step 8: Run route/link/trail tests and verify GREEN**

Run:

```powershell
npm.cmd run test -w @gal-toolbox/web -- src/app/routes.test.tsx src/app/RouteTransition.test.tsx src/components.test.tsx src/trail.test.tsx
```

Expected: all route, transition, intent, and trail tests PASS.

- [ ] **Step 9: Write failing VN and artist page tests**

Extend the `VnDetail` fixtures in `apps/web/src/pages/VnPage.test.tsx` with `artists`. Add one test using `s1928` with both roles and `s223` with note `Character sprites, BG`; assert one link per Staff, `/knowledge/artist/s1928`, original-script primary name, romanized auxiliary name, labels `原画／美术` then `角色设计`, and the cleaned note. Add a second fixture with `artists: []` and assert the entire `原画与角色设计` section is absent.

Create `apps/web/src/pages/ArtistPage.test.tsx` with query data seeded under `['artist', 's1928']` and infinite data seeded under `['artist-vns', 's1928']`. Assert the header uses kind label `画师`, aliases and biography appear, the only relation heading is `参与作品`, each work card links to `/knowledge/vn/:id`, and credits render in `art` then `chardesign` order with nonblank notes. Spy on `useBufferedPages()` and assert its argument contains `{ scope: "artist:s1928" }`. Add an empty page assertion for exact state text `暂无画师作品记录`.

- [ ] **Step 10: Run page tests and verify RED**

Run:

```powershell
npm.cmd run test -w @gal-toolbox/web -- src/pages/VnPage.test.tsx src/pages/ArtistPage.test.tsx
```

Expected: FAIL because the VN artist section and `ArtistPage` do not exist.

- [ ] **Step 11: Implement the VN artist section and buffered Artist page**

In `VnPage.tsx`, render `原画与角色设计` after the character/voice section and omit its section node when `vn.artists.length === 0`. For each relation, render one `ArtistPrefetchLink`, Staff monogram, primary and romanized names, and the shared `ArtistCredits`. Keep the existing character/voice, Tag, and related-VN sections unchanged.

Implement `ArtistPage.tsx` by following the Staff page query/pagination structure with these substitutions:

```ts
const detail = useQuery({ ...artistQuery(id), enabled: Boolean(id) });
const works = useInfiniteQuery({
  ...artistVnsQuery(id, () => nextPagePriority.current),
  enabled: Boolean(id),
});
const buffered = useBufferedPages({
  scope: `artist:${id}`,
  pages: works.data?.pages ?? [],
  hasNextPage: works.hasNextPage,
  isFetchingNextPage: works.isFetchingNextPage,
  fetchNextPage,
  promoteNextPage,
});
```

`promoteNextPage(signal)` calls `getArtistVns(id, nextPage, 12, { signal, priority: 'high' })`. Visit the trail with `visit(detail.data.entity, artistPath(detail.data.entity.id))`. Use loading title `正在打开画师资料`, error title `画师资料加载失败`, `NameBlock kindLabel="画师"`, Staff monogram fallback, aliases, description, relation heading `参与作品`, `EntityCard` work cards with `meta={<ArtistCredits credits={credits} />}`, and empty state `暂无画师作品记录`. Work cards use `EntityPrefetchLink`, so VN hover/focus prefetch, click promotion, cancellation, and navigation remain the existing tested behavior. Pass the following exact pagination props:

```tsx
<AutoPageLoader
  pageScope={`artist:${id}`}
  pageProgress={buffered.visiblePageCount}
  hasNextPage={buffered.canRevealNextPage}
  isFetching={buffered.isWaitingForBuffer}
  buffered={buffered.hasBufferedPage}
  onLoad={() => void buffered.revealNextPage()}
  label={buffered.hasBufferedPage ? "下一页已准备好" : "继续浏览作品"}
/>
```

Add artist-specific layout rules to `apps/web/src/styles/knowledge.css`: a distinct `.detail-artist` accent, responsive artist relation grid/cards, wrapping `.artist-credits`, visible role chips and notes, and `min-width: 0`/overflow wrapping at 390px. Reuse `.staff-hero` and `.staff-glyph`; do not introduce an artist image URL.

- [ ] **Step 12: Verify focused Web behavior and all automated checks**

Run:

```powershell
npm.cmd run test -w @gal-toolbox/web -- src/api.test.ts src/queries.test.ts src/components.test.tsx src/trail.test.tsx src/app/routes.test.tsx src/app/RouteTransition.test.tsx src/pages/VnPage.test.tsx src/pages/ArtistPage.test.tsx
npm.cmd run test -w @gal-toolbox/web
npm.cmd run typecheck -w @gal-toolbox/web
npm.cmd run build -w @gal-toolbox/web
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
git diff --check
```

Expected: every focused and full test, both workspace typechecks, both production builds, and whitespace validation exit 0.

- [ ] **Step 13: Perform desktop and 390px browser acceptance with real VNDB samples**

Start the application from the repository root:

```powershell
npm.cmd run dev
```

At a 1440 × 900 viewport, open `http://localhost:5173/knowledge/vn/v17` and verify:

1. `s1928` appears exactly once in `原画与角色设计` with both `原画／美术` and `角色设计`.
2. `s223` displays the note `Character sprites, BG`.
3. Hover and keyboard-focus on the `s1928` artist link trigger low-priority requests for `/api/v1/artists/s1928` and `/api/v1/artists/s1928/vns?page=1&pageSize=12`.
4. Pointerdown/click promotes both requests to high priority and opens `/knowledge/artist/s1928`.
5. The document title is `画师图鉴`, the transition announces `正在准备画师资料`, and the page shows only `参与作品` as its relation section.
6. The first work page shows 12 or fewer cards while the next page buffers without appearing; revealing it advances exactly one page.
7. Opening the first work card whose VN ID differs from `v17` navigates to its `/knowledge/vn/:id` page.
8. The exploration trail retains separate `/knowledge/staff/s1928` and `/knowledge/artist/s1928` entries after visiting both contexts.

Repeat the complete `v17 → s1928 artist → another VN` path at 390 × 844. Assert `document.documentElement.scrollWidth === document.documentElement.clientWidth`, no horizontal scrollbar, no failed API request, and no console error at either viewport. Capture `output/playwright/vn-artist-desktop.png` and `output/playwright/vn-artist-mobile-390.png` as acceptance evidence without staging them.

- [ ] **Step 14: Commit Task 2 independently**

Run `git status --short` and confirm only the listed Web files are staged. Commit:

```powershell
git add apps/web/src/api.ts apps/web/src/api.test.ts apps/web/src/queries.ts apps/web/src/queries.test.ts apps/web/src/components.tsx apps/web/src/components.test.tsx apps/web/src/app/navigation.ts apps/web/src/app/routes.tsx apps/web/src/app/routes.test.tsx apps/web/src/app/RouteTransition.tsx apps/web/src/app/RouteTransition.test.tsx apps/web/src/trail.tsx apps/web/src/trail.test.tsx apps/web/src/pages/HomePage.tsx apps/web/src/pages/VnPage.tsx apps/web/src/pages/VnPage.test.tsx apps/web/src/pages/ArtistPage.tsx apps/web/src/pages/ArtistPage.test.tsx apps/web/src/styles/knowledge.css
git commit -m "feat(web): add VN artist exploration chain"
```

Expected: the commit contains only Task 2 source and test files; browser screenshots remain untracked acceptance artifacts.
