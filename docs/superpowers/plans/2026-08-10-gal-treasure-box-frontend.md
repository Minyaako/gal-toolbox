# Gal Treasure Box Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the Gal Treasure Box application shell, navigation, settings, and visual refresh while preserving the existing VNDB knowledge-search experience and its performance behavior.

**Architecture:** Keep the API client, React Query query options, two-page buffering, and intent-prefetch layer intact, while moving route ownership from the monolithic `App.tsx` into route-aware app utilities and focused pages. A persistent application shell owns responsive navigation and the transition overlay; settings are a small versioned local-storage domain that feeds the shell, transition state machine, and knowledge image/prefetch behavior.

**Tech Stack:** React 19, TypeScript 5.9, React Router DOM 7, TanStack React Query 5, Vite 7, Vitest 4, CSS custom properties, ImageGen-generated WebP/PNG assets.

## Global Constraints

- All implementation and commits land on the `dev` branch.
- Preserve backend API paths, OpenAPI, DTOs, the React Query/HTTP/SQLite caching layers, and public pagination semantics; do not add a Service Worker or image proxy.
- Every search, staff-character, and tag-VN page remains 12 items, shows one loaded page while preparing one next page, and reveals only one page per scroll intersection.
- `pointerenter`, `focus`, and `pointerdown` detail prefetches reuse the identical entity query key; prefetch failures remain silent and visible navigation owns retry errors.
- Persist settings under a versioned local-storage key; malformed values fall back to defaults, and `prefers-reduced-motion` overrides “full” motion unless the user explicitly chooses to allow it.
- The standard route transition is a two-layer diagonal rose/red then cyan curtain of about 500 ms with a 70 ms second-layer delay; reduced motion is a ~120 ms fade without large movement, sweeps, flashing, or parallax.
- Use semantic CSS tokens rather than scattered color literals in business components; text, buttons, and focus indicators on light backgrounds meet WCAG AA contrast.
- Preserve a stable image aspect ratio with lightweight placeholder/fade-in; image failure uses an entity-specific fallback, never a broken-image icon.
- Keep generated decoration text-free and non-blocking: fall back to vector icons when it is missing. Preserve the source screenshot, write derived assets only to the web public-assets directory, and record the source and ImageGen prompt.
- Decorative images use empty alternative text, content images use entity names, and transition curtains are `aria-hidden`; loading state is separately announced through a live region.
- At 390×844 there is no horizontal overflow and bottom navigation never covers content; desktop details are two-column, medium widths collapse the relation rail, and mobile is one column.

---

## File Structure

- `apps/web/src/app/routes.tsx` — one route table for official paths, legacy redirects, the explicit 404 page, and the route-to-title contract.
- `apps/web/src/app/navigation.ts` — typed main-navigation metadata shared by desktop rail, mobile bottom navigation, and the home cards.
- `apps/web/src/app/settings.ts` — versioned `UserSettings` type, defaulting/validation, local-storage I/O, and effective-motion calculation.
- `apps/web/src/app/RouteTransition.tsx` — transition reducer/hook and aria-hidden two-curtain overlay driven by `UserSettings`.
- `apps/web/src/app/AppShell.tsx` — desktop rail, compact top status bar, mobile bottom navigation, skip link, and main content outlet.
- `apps/web/src/pages/HomePage.tsx`, `RankingPage.tsx`, `SettingsPage.tsx`, `NotFoundPage.tsx` — focused first-class pages for the lobby, intentional ranking placeholder, persistent settings UI, and recoverable unknown URL state.
- `apps/web/src/pages/KnowledgeLayout.tsx` — knowledge route frame and search entry that keeps `SearchPage` as the data/search implementation.
- `apps/web/src/components.tsx` and `apps/web/src/api.ts` — adapt entity links and image presentation to official knowledge URLs without changing API DTOs or query keys.
- `apps/web/src/styles/tokens.css`, `base.css`, `shell.css`, `knowledge.css` — semantic visual tokens and separated responsive styles, imported by `src/main.tsx`.
- `apps/web/public/brand/*`, `apps/web/public/decorations/*`, and `apps/web/public/asset-sources.md` — derived favicon/app icons, compressed generated decoration assets, and reproducible source/prompt record.
- `apps/web/src/**/*.test.ts(x)` — Vitest tests for routing contracts, settings/transition state, image fallback behavior, and existing buffering/prefetch invariants.

### Task 1: Route Contract and Persistent Application Shell

**Files:**
- Create: `apps/web/src/app/navigation.ts`
- Create: `apps/web/src/app/routes.tsx`
- Create: `apps/web/src/app/AppShell.tsx`
- Create: `apps/web/src/pages/HomePage.tsx`
- Create: `apps/web/src/pages/KnowledgeLayout.tsx`
- Create: `apps/web/src/pages/RankingPage.tsx`
- Create: `apps/web/src/pages/SettingsPage.tsx`
- Create: `apps/web/src/pages/NotFoundPage.tsx`
- Create: `apps/web/src/app/routes.test.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/components.tsx`
- Modify: `apps/web/src/pages/SearchPage.tsx`

**Interfaces:**
- Consumes: `EntitySummary`, `entityPath(entity)` from `apps/web/src/api.ts`, `SearchPage` from `apps/web/src/pages/SearchPage.tsx`, and the existing `TrailProvider`.
- Produces: `export type AppSection = "home" | "knowledge" | "ranking" | "settings"`; `export const mainNavigation: readonly NavigationItem[]`; `export function knowledgeEntityPath(entity: Pick<EntitySummary, "id" | "type">): string`; `export const appRoutes: RouteObject[]`; `export function pageTitle(pathname: string): string`; and `AppShell` rendering an `Outlet` inside `#main-content`.

- [ ] **Step 1: Write failing route-contract tests**

```tsx
import { matchRoutes } from "react-router-dom";
import { appRoutes, pageTitle } from "./routes";

test("matches all official knowledge routes and preserves the title contract", () => {
  expect(matchRoutes(appRoutes, "/knowledge/vn/v17")?.at(-1)?.route.path)
    .toBe("/knowledge/vn/:id");
  expect(pageTitle("/knowledge/tag/g19")).toBe("Tag 图鉴");
});

test("legacy detail URLs use replace redirects and unknown paths resolve to 404", () => {
  const legacy = matchRoutes(appRoutes, "/vn/v17")?.at(-1)?.route;
  expect(legacy?.path).toBe("/vn/:id");
  expect(matchRoutes(appRoutes, "/missing")?.at(-1)?.route.path).toBe("*");
});
```

- [ ] **Step 2: Run the route test to verify it fails**

Run: `npm run test -w @gal-toolbox/web -- src/app/routes.test.tsx`

Expected: FAIL because `src/app/routes.tsx` and its route contract do not exist.

- [ ] **Step 3: Implement the minimal typed route table and shell**

```tsx
// src/app/routes.tsx
export const appRoutes: RouteObject[] = [{
  element: <AppShell />,
  children: [
    { path: "/", element: <HomePage /> },
    { path: "/knowledge", element: <KnowledgeLayout /> },
    { path: "/knowledge/vn/:id", element: <VnPage /> },
    { path: "/knowledge/character/:id", element: <CharacterPage /> },
    { path: "/knowledge/staff/:id", element: <StaffPage /> },
    { path: "/knowledge/tag/:id", element: <TagPage /> },
    { path: "/ranking", element: <RankingPage /> },
    { path: "/settings", element: <SettingsPage /> },
    { path: "/vn/:id", element: <LegacyRedirect type="vn" /> },
    { path: "/character/:id", element: <LegacyRedirect type="character" /> },
    { path: "/staff/:id", element: <LegacyRedirect type="staff" /> },
    { path: "/tag/:id", element: <LegacyRedirect type="tag" /> },
    { path: "*", element: <NotFoundPage /> },
  ],
}];
```

Implement redirects with a `LegacyRedirect` component that reads `useParams()`, constructs the exact `/knowledge/*/${id}${location.search}${location.hash}` destination, and returns `<Navigate replace>`, rather than putting the literal `:id` in `to`. Replace the `Routes` currently in `App.tsx` with `useRoutes(appRoutes)`; retain `ScrollToTop`, `QueryClientProvider`, `BrowserRouter`, and `TrailProvider`. Make every app-navigation item a real `NavLink`, use `aria-current="page"` for its active item, and render the same metadata in the desktop rail and mobile bottom navigation. Update `entityPath()` and all direct entity links to generate `/knowledge/*` paths.

- [ ] **Step 4: Run route and existing knowledge tests to verify they pass**

Run: `npm run test -w @gal-toolbox/web -- src/app/routes.test.tsx src/queries.test.ts src/buffered-pages.test.ts`

Expected: PASS; official URLs resolve, legacy links redirect with replacement history, 404 is explicit, and current prefetch/buffered-page behavior remains green.

- [ ] **Step 5: Commit the independently working shell migration**

```bash
git add apps/web/src/App.tsx apps/web/src/main.tsx apps/web/src/api.ts apps/web/src/components.tsx apps/web/src/pages/SearchPage.tsx apps/web/src/app apps/web/src/pages/HomePage.tsx apps/web/src/pages/KnowledgeLayout.tsx apps/web/src/pages/RankingPage.tsx apps/web/src/pages/SettingsPage.tsx apps/web/src/pages/NotFoundPage.tsx
git commit -m "feat(web): add treasure box shell and official routes"
```

### Task 2: Settings Domain and Accessible Route Transitions

**Files:**
- Create: `apps/web/src/app/settings.ts`
- Create: `apps/web/src/app/settings.test.ts`
- Create: `apps/web/src/app/RouteTransition.tsx`
- Create: `apps/web/src/app/RouteTransition.test.tsx`
- Modify: `apps/web/src/pages/SettingsPage.tsx`
- Modify: `apps/web/src/app/AppShell.tsx`
- Modify: `apps/web/src/queries.ts`
- Modify: `apps/web/src/components.tsx`

**Interfaces:**
- Consumes: `AppShell` from Task 1 and `prefetchEntity(queryClient, entity, preload?)` from `apps/web/src/queries.ts`.
- Produces: `export type MotionPreference = "full" | "reduced" | "off"`; `export type UserSettings`; `export const DEFAULT_SETTINGS: UserSettings`; `export function readSettings(storage?: Storage): UserSettings`; `export function writeSettings(settings: UserSettings, storage?: Storage): void`; `export function effectiveMotion(settings: UserSettings, systemReduced: boolean): MotionPreference`; `SettingsProvider`; and `RouteTransition` with a finite `"idle" | "covering" | "revealing"` state.

- [ ] **Step 1: Write failing persistence and transition tests**

```tsx
test("falls back to defaults for corrupt or obsolete local settings", () => {
  storage.setItem("gal-toolbox-settings-v1", "{bad json");
  expect(readSettings(storage)).toEqual(DEFAULT_SETTINGS);
});

test("system reduced motion wins until the user explicitly permits full motion", () => {
  expect(effectiveMotion({ ...DEFAULT_SETTINGS, motion: "full", allowFullMotion: false }, true))
    .toBe("reduced");
});

test("transition always returns to idle after a ready target or load failure", () => {
  expect(reduceTransition("covering", { type: "finish" })).toBe("revealing");
  expect(reduceTransition("revealing", { type: "settled" })).toBe("idle");
});
```

- [ ] **Step 2: Run the settings and transition tests to verify they fail**

Run: `npm run test -w @gal-toolbox/web -- src/app/settings.test.ts src/app/RouteTransition.test.tsx`

Expected: FAIL because settings storage, effective-motion rules, and the transition reducer have not been implemented.

- [ ] **Step 3: Implement versioned settings, transition state, and settings controls**

```ts
export const DEFAULT_SETTINGS = {
  motion: "full", allowFullMotion: false, imageQuality: "balanced",
  prefetch: "balanced", density: "standard",
} as const;

export function readSettings(storage: Storage = localStorage): UserSettings {
  try { return parseSettings(storage.getItem("gal-toolbox-settings-v1")) ?? DEFAULT_SETTINGS; }
  catch { return DEFAULT_SETTINGS; }
}
```

`SettingsPage` must provide labelled radio groups for motion (full/reduced/off), image quality (data saver/balanced/high), prefetch (data saver/balanced/aggressive), and density (comfortable/standard/compact), a cache summary, and a confirmation-based clear action for the versioned preferences and React Query cache. `RouteTransition` must start covering before navigation, swap content only when covered, show a type-appropriate loading label when the destination has no ready data, continue opportunistic prefetch, and always reveal/settle on success, error, history navigation, or animation unavailability. Map image-quality preference only to existing browser image sizing/loading choices and prefetch preference only to client-side trigger intensity; never change API page size or server requests. Expose a polite `aria-live` status separate from the `aria-hidden` curtains.

- [ ] **Step 4: Run focused and regression tests to verify they pass**

Run: `npm run test -w @gal-toolbox/web -- src/app/settings.test.ts src/app/RouteTransition.test.tsx src/queries.test.ts src/buffered-pages.test.ts`

Expected: PASS; corruption safely defaults, explicit user choice and system reduced-motion precedence are correct, every transition terminal path is idle, and prefetch/buffering invariants remain unchanged.

- [ ] **Step 5: Commit the settings and transition deliverable**

```bash
git add apps/web/src/app/settings.ts apps/web/src/app/settings.test.ts apps/web/src/app/RouteTransition.tsx apps/web/src/app/RouteTransition.test.tsx apps/web/src/pages/SettingsPage.tsx apps/web/src/app/AppShell.tsx apps/web/src/queries.ts apps/web/src/components.tsx
git commit -m "feat(web): persist preferences and add route transitions"
```

### Task 3: Visual Lobby, Ranking Placeholder, Knowledge Adaptation, and Assets

**Files:**
- Modify: `apps/web/src/pages/RankingPage.tsx`
- Create: `apps/web/src/styles/tokens.css`
- Create: `apps/web/src/styles/base.css`
- Create: `apps/web/src/styles/shell.css`
- Create: `apps/web/src/styles/knowledge.css`
- Create: `apps/web/src/components.test.tsx`
- Create: `apps/web/public/brand/favicon.ico`
- Create: `apps/web/public/brand/icon-32.png`
- Create: `apps/web/public/brand/icon-64.png`
- Create: `apps/web/public/brand/icon-180.png`
- Create: `apps/web/public/brand/icon-192.png`
- Create: `apps/web/public/brand/icon-512.png`
- Create: `apps/web/public/brand/brand.webp`
- Create: `apps/web/public/decorations/lobby-knowledge.webp`
- Create: `apps/web/public/decorations/lobby-ranking.webp`
- Create: `apps/web/public/decorations/lobby-settings.webp`
- Create: `apps/web/public/decorations/entity-icons.webp`
- Create: `apps/web/public/asset-sources.md`
- Modify: `apps/web/src/pages/HomePage.tsx`
- Modify: `apps/web/src/pages/KnowledgeLayout.tsx`
- Modify: `apps/web/src/pages/SearchPage.tsx`
- Modify: `apps/web/src/pages/VnPage.tsx`
- Modify: `apps/web/src/pages/CharacterPage.tsx`
- Modify: `apps/web/src/pages/StaffPage.tsx`
- Modify: `apps/web/src/pages/TagPage.tsx`
- Modify: `apps/web/src/components.tsx`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/index.html`

**Interfaces:**
- Consumes: `mainNavigation` from Task 1, `UserSettings`/effective density and image preferences from Task 2, `EntityCard`, `EntityImage`, React Query query options, and `useBufferedPages`.
- Produces: `RankingPage` with no data query; `export function imagePresentation(image: EntityImage, alt: string): { kind: "image" | "fallback"; alt: string; fallbackText: string }`; CSS classes scoped to lobby, ranking, shell, and knowledge/detail components; and a recorded source/prompt manifest for all derived artwork.

- [ ] **Step 1: Write failing visual-behavior unit tests**

```tsx
test("returns a semantic entity fallback when an image is absent or failed", () => {
  expect(imagePresentation(null, "Ever17")).toEqual({
    kind: "fallback", alt: "Ever17", fallbackText: "E",
  });
});

test("keeps a real image presentation when a thumbnail is available", () => {
  expect(imagePresentation({ url: "cover.jpg", thumbnailUrl: "thumb.jpg", sexual: 0, violence: 0 }, "Ever17").kind)
    .toBe("image");
});
```

- [ ] **Step 2: Run the component test to verify it fails**

Run: `npm run test -w @gal-toolbox/web -- src/components.test.tsx`

Expected: FAIL because `imagePresentation` does not exist.

- [ ] **Step 3: Implement the visual system, first-class pages, and non-blocking assets**

```css
/* src/styles/tokens.css */
:root {
  --surface-canvas: #f3f5f1; --surface-card: #fcfcf8; --ink-strong: #102b4c;
  --brand-navy: #12345b; --accent-rose: #b9405d; --accent-cyan: #197b91;
  --accent-archive: #2f6559; --accent-gold: #aa7d2f; --focus-ring: #075d80;
}
```

Build the asymmetrical home hall with an immediately actionable knowledge primary card, ranking/settings secondary cards, recent-exploration summary, and a deliberately quiet “more functions” slot. The ranking page must retain the full shell and provide title, decorative frame, disabled-looking future filter/list outlines, and “正在整理榜单” status without making a ranking request. Rework knowledge search/results and all four detail pages into the specified entity identities and desktop relation rail / mobile content order while retaining their existing queries, 12-item buffered pagination, Chinese Tag primary label plus English secondary label, intent prefetch handlers, errors, and retry controls. `EntityImage` must use `imagePresentation`, final-size aspect-ratio containers, eager/high priority only for above-fold detail art, and vector fallback if a generated decoration asset is unavailable.

Create the PNG/favicon derivatives by square-cropping the face-centred source `C:\Users\li\Pictures\Screenshots\屏幕截图 2025-12-24 221328.png`; create the 32/64/180/192/512 PNGs, `favicon.ico`, and compressed `brand.webp`. Generate one transparent, text-free decoration sheet covering knowledge, character, staff, Tag, ranking, and settings motifs; trim and WebP-compress its slices. In `asset-sources.md`, record the immutable source path, crop rule, asset paths, ImageGen prompt, generation date, and optimization command; do not copy, overwrite, or AI-redraw the source screenshot. Reference the icons in `index.html` and the app shell.

- [ ] **Step 4: Run component, knowledge regression, typecheck, and production build checks**

Run: `npm run test -w @gal-toolbox/web -- src/components.test.tsx src/tag-label.test.ts src/queries.test.ts src/buffered-pages.test.ts && npm run typecheck -w @gal-toolbox/web && npm run build -w @gal-toolbox/web`

Expected: PASS; image paths preserve layout/fallback semantics, Chinese Tag behavior and prefetch/buffering stay green, and the decorative asset fallback does not block production build.

- [ ] **Step 5: Commit the visual and asset deliverable**

```bash
git add apps/web/index.html apps/web/src/pages apps/web/src/components.tsx apps/web/src/components.test.tsx apps/web/src/styles apps/web/src/main.tsx apps/web/public
git commit -m "feat(web): add treasure box visual lobby and assets"
```

### Task 4: Responsive Accessibility and Browser Acceptance

**Files:**
- Modify: `apps/web/src/app/AppShell.tsx`
- Modify: `apps/web/src/app/RouteTransition.tsx`
- Modify: `apps/web/src/pages/HomePage.tsx`
- Modify: `apps/web/src/pages/RankingPage.tsx`
- Modify: `apps/web/src/pages/SettingsPage.tsx`
- Modify: `apps/web/src/pages/KnowledgeLayout.tsx`
- Modify: `apps/web/src/pages/SearchPage.tsx`
- Modify: `apps/web/src/pages/VnPage.tsx`
- Modify: `apps/web/src/pages/CharacterPage.tsx`
- Modify: `apps/web/src/pages/StaffPage.tsx`
- Modify: `apps/web/src/pages/TagPage.tsx`
- Modify: `apps/web/src/components.tsx`
- Modify: `apps/web/src/styles/base.css`
- Modify: `apps/web/src/styles/shell.css`
- Modify: `apps/web/src/styles/knowledge.css`
- Modify: `apps/web/src/app/routes.test.tsx`
- Modify: `apps/web/src/app/settings.test.ts`

**Interfaces:**
- Consumes: all route, shell, settings, transition, and entity-image interfaces produced in Tasks 1–3.
- Produces: verified keyboard-accessible and responsive layouts with route-title, focus, live-region, reduced-motion, image-failure, and browser-flow acceptance evidence; no new runtime API or persistence interfaces.

- [ ] **Step 1: Extend failing accessibility contract tests**

```tsx
test("each top-level route has one stable page-title contract", () => {
  expect(pageTitle("/")).toBe("百宝箱大厅");
  expect(pageTitle("/ranking")).toBe("Gal 排行");
  expect(pageTitle("/settings")).toBe("设置");
});

test("motion off is never promoted by system preference", () => {
  expect(effectiveMotion({ ...DEFAULT_SETTINGS, motion: "off" }, false)).toBe("off");
  expect(effectiveMotion({ ...DEFAULT_SETTINGS, motion: "off" }, true)).toBe("off");
});
```

- [ ] **Step 2: Run the expanded contract tests to verify they fail**

Run: `npm run test -w @gal-toolbox/web -- src/app/routes.test.tsx src/app/settings.test.ts`

Expected: FAIL until every top-level route exposes its specified title and the motion-off precedence is encoded.

- [ ] **Step 3: Apply the accessibility/responsive acceptance corrections and run the browser matrix**

```text
Desktop: / → /knowledge → /knowledge/vn/:id → /knowledge/character/:id → /knowledge/staff/:id → another character
Desktop: VN → Chinese Tag → related VN; directly refresh each detail URL; open a legacy /vn/:id URL
Mobile 390×844: verify one-column details, visible keyboard focus, no horizontal overflow, and unoccluded bottom navigation
Motion: full, reduced, and off; cold cache, warm cache, slow-network and image-failure states
Shell: visit ranking and settings; verify ranking sends no ranking request and preferences persist after reload
```

Use keyboard-only Tab/Shift+Tab/Enter to verify skip link, real links, focus-visible rings, card activation, and focus-based prefetch. Ensure decorative images have `alt=""`, content images use names, the curtain remains `aria-hidden`, each loading/error state uses its existing local status/retry panel, and a page has one `h1`. Make only corrections demonstrated by these checks: mobile spacing/padding, rail-to-content reflow, focus clipping, `aria-current`, announced status, transition terminal timing, and image fallback sizing. Capture the route/motion/network console checks with zero uncaught errors.

- [ ] **Step 4: Run the complete automated verification suite**

Run: `npm test && npm run typecheck && npm run build`

Expected: PASS for root tests, API/web type checks, and production builds; no change to the API/OpenAPI contract.

- [ ] **Step 5: Commit final acceptance fixes**

```bash
git add apps/web/src/app apps/web/src/pages apps/web/src/components.tsx apps/web/src/styles
git commit -m "fix(web): complete responsive accessibility acceptance"
```

## Spec Coverage Review

- Official routes, replace-style legacy redirects, explicit 404, desktop/mobile shell, and true-link navigation are handled in Task 1.
- Lobby, non-fake ranking placeholder, first-release settings, local storage recovery, motion precedence, and the two-curtain transition state machine are handled in Tasks 2–3.
- Existing search/details, Chinese Tags, query-key prefetch, 12-item two-page buffering, image loading/failure, cache behavior, and no new service worker/proxy are protected in Tasks 1–3 and regression-tested in each task.
- Semantic visual tokens, generated decorative/brand assets with provenance, favicon derivatives, responsive reflow, keyboard semantics, live states, and browser acceptance are handled in Tasks 3–4.
- No spec requirement is intentionally deferred; genuine ranking data, accounts/sync, offline service workers, image proxies, and the other listed out-of-scope work remain excluded.
