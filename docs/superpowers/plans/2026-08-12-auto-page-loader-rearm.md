# Auto Page Loader Rearm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow automatic pagination to trigger again after one page is successfully revealed, even when the sentinel never leaves the 600px trigger zone.

**Architecture:** Preserve the intersection latch that prevents duplicate callbacks. Add a numeric `pageProgress` prop carrying `visiblePageCount`; rearm the latch only when that value changes, rather than relying only on an exit callback.

**Tech Stack:** React 19, TypeScript, Vitest, happy-dom.

## Global Constraints

- Do not change API calls, request priority, page size, buffer depth, or IntersectionObserver root margin.
- One page-progress event may arm at most one subsequent automatic reveal; no cascading through multiple pages in one render cycle.
- The manual loader button remains available.

---

### Task 1: Rearm automatic pagination after page progress

**Files:**
- Modify: `apps/web/src/components.tsx`
- Modify: `apps/web/src/pages/SearchPage.tsx`
- Modify: `apps/web/src/pages/StaffPage.tsx`
- Modify: `apps/web/src/pages/TagPage.tsx`
- Test: `apps/web/src/components.test.tsx`

**Interfaces:**
- Consumes: `AutoPageLoader({ hasNextPage, isFetching, buffered, pageProgress, onLoad, label })`, where every caller passes `buffered.visiblePageCount`
- Produces: the same pagination behavior plus required numeric `pageProgress`

- [ ] **Step 1: Write the failing regression test**

Add a happy-dom component test with a controllable `IntersectionObserver` stub. Render `pageProgress={1}`, emit intersecting twice and expect one load; rerender with `pageProgress={2}`, emit intersecting and expect the second load.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd run test -w @gal-toolbox/web -- src/buffered-pages.test.ts src/components.test.tsx`

Expected: the new regression fails because the latch remains disarmed after page progress.

- [ ] **Step 3: Implement the minimal rearm**

Add required `pageProgress: number` to `AutoPageLoader`. In an effect keyed by `pageProgress`, set `autoLoadArmedRef.current = true`. Pass `buffered.visiblePageCount` from Search, Staff, and Tag pages. Do not remove duplicate-callback suppression and do not change the observer margin.

- [ ] **Step 4: Verify GREEN and regressions**

Run the focused tests, then `npm.cmd run test -w @gal-toolbox/web`, `npm.cmd run typecheck -w @gal-toolbox/web`, and `npm.cmd run build -w @gal-toolbox/web`.

- [ ] **Step 5: Commit**

Commit only the regression test and minimal implementation with message `fix(web): rearm automatic page loading after progress`.
