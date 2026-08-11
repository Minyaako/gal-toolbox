# Adaptive Artist and Staff Work Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make artist works and staff roles share one responsive grid that reaches six columns on wide content areas without retaining empty tracks.

**Architecture:** Keep the existing page markup and card component. Consolidate only the relevant selectors in `knowledge.css`; keep the VN-detail artist relation grid separate.

**Tech Stack:** React 19, TypeScript, CSS Grid, Vitest, Playwright browser acceptance.

## Global Constraints

- Do not change API, pagination, prefetch, card markup, or VN-detail artist relation layout.
- Wide layout uses `auto-fit` with a 205px minimum; <=760px uses two columns; <=430px uses one column.
- Follow RED -> GREEN TDD and commit one implementation change.

---

### Task 1: Share the adaptive work grid

**Files:**
- Modify: `apps/web/src/styles/knowledge.css`
- Test: `apps/web/src/pages/ArtistPage.test.tsx`

**Interfaces:**
- Consumes: existing `.role-grid`, `.artist-work-grid`, and `.artist-relation-grid` class names.
- Produces: one shared responsive CSS contract for staff roles and artist works.

- [ ] **Step 1: Write the failing CSS contract test**

Add a test that reads `src/styles/knowledge.css` and asserts that `.role-grid, .artist-work-grid` use `repeat(auto-fit, minmax(205px, 1fr))`, while the 760px and 430px media rules include both selectors with two and one columns respectively. Assert that `.artist-relation-grid` retains its independent two-column declaration.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd run test -w @gal-toolbox/web -- src/pages/ArtistPage.test.tsx`

Expected: FAIL because the current artist work grid is fixed to two columns and the shared staff rule uses `auto-fill`.

- [ ] **Step 3: Implement the minimal CSS change**

Split the current combined artist selector and define:

```css
.role-grid, .artist-work-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(205px, 1fr));
  gap: 16px;
}
.artist-relation-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
```

Extend the existing 760px two-column and 430px one-column selectors to include `.artist-work-grid`; keep `.artist-relation-grid` one-column only at 430px.

- [ ] **Step 4: Verify GREEN and regressions**

Run:

```powershell
npm.cmd run test -w @gal-toolbox/web -- src/pages/ArtistPage.test.tsx
npm.cmd run test -w @gal-toolbox/web
npm.cmd run typecheck -w @gal-toolbox/web
npm.cmd run build -w @gal-toolbox/web
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 5: Browser acceptance**

At wide desktop, verify both artist works and staff roles use the same computed grid rule and can form six columns; at 760px and 390px verify two and one columns, with no horizontal overflow.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/styles/knowledge.css apps/web/src/pages/ArtistPage.test.tsx
git commit -m "fix(web): unify artist and staff work grids"
```

