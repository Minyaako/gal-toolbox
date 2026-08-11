# Gtool Production Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run Gal Toolbox at `https://gtool.minyako.top` with hourly cache maintenance and a manual Docker Compose deployment.

**Architecture:** A single Node.js container serves the built React site and Fastify API, stores its disposable SQLite cache on a named volume, and joins the existing `server_proxy` network. The API owns one hourly maintenance timer; shared Caddy terminates HTTPS and forwards the public domain to the container.

**Tech Stack:** TypeScript, Vitest, Node.js 24, Fastify, React/Vite, SQLite, Docker Compose, Caddy

## Global Constraints

- Keep the deployment to one application container; do not add cron, Redis, PostgreSQL, or a worker.
- Preserve the existing seven-day stale-cache fallback while invoking `CacheStore.prune()` every hour.
- Do not add GitHub Actions or store GitHub credentials on the server.
- Do not publish a host port; connect the container only to `server_proxy`.
- Keep the root filesystem read-only and run the application as a non-root user.
- Treat `/data/cache.sqlite` as disposable cache data, not business data.

---

### Task 1: Hourly Cache Maintenance

**Files:**
- Create: `apps/api/src/cache-maintenance.test.ts`
- Create: `apps/api/src/cache-maintenance.ts`
- Modify: `apps/api/src/server.ts`

**Interfaces:**
- Consumes: `CacheStore.prune()` and the existing graceful shutdown path.
- Produces: `startCacheMaintenance(cache, options?) => () => void`, where the returned function stops the timer.

- [ ] **Step 1: Write the failing timer tests**

Create `apps/api/src/cache-maintenance.test.ts` with fake timers. Use a small object whose real `prune()` method increments a counter. Assert that `startCacheMaintenance()` does not prune immediately, prunes after `3_600_000` ms, and no longer prunes after its returned stop function is called. Add a second case where `prune()` throws and an injected `onError` callback records the error without allowing the timer callback to throw.

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { startCacheMaintenance } from "./cache-maintenance.js";

afterEach(() => vi.useRealTimers());

describe("startCacheMaintenance", () => {
  it("prunes hourly until stopped", () => {
    vi.useFakeTimers();
    let pruneCount = 0;
    const stop = startCacheMaintenance({ prune: () => { pruneCount += 1; } });

    expect(pruneCount).toBe(0);
    vi.advanceTimersByTime(3_600_000);
    expect(pruneCount).toBe(1);

    stop();
    vi.advanceTimersByTime(3_600_000);
    expect(pruneCount).toBe(1);
  });

  it("reports cleanup failures and keeps the timer alive", () => {
    vi.useFakeTimers();
    const errors: unknown[] = [];
    const failure = new Error("sqlite busy");
    const stop = startCacheMaintenance(
      { prune: () => { throw failure; } },
      { onError: (error) => errors.push(error) },
    );

    expect(() => vi.advanceTimersByTime(7_200_000)).not.toThrow();
    expect(errors).toEqual([failure, failure]);
    stop();
  });
});
```

- [ ] **Step 2: Verify the tests fail for the missing module**

Run: `npm.cmd test -w @gal-toolbox/api -- src/cache-maintenance.test.ts`

Expected: FAIL because `./cache-maintenance.js` does not exist.

- [ ] **Step 3: Implement the minimal maintenance timer**

Create `apps/api/src/cache-maintenance.ts`. Accept only a `prune()` capability, default to a one-hour interval, catch cleanup failures, call the supplied error handler, and call `unref()` so the timer cannot keep shutdown alive.

```ts
import type { CacheStore } from "./cache.js";

const ONE_HOUR_MS = 60 * 60 * 1000;

type CachePruner = Pick<CacheStore, "prune">;

type MaintenanceOptions = {
  intervalMs?: number;
  onError?: (error: unknown) => void;
};

export function startCacheMaintenance(
  cache: CachePruner,
  options: MaintenanceOptions = {},
): () => void {
  const onError = options.onError ?? ((error) => console.error("Cache prune failed", error));
  const timer = setInterval(() => {
    try {
      cache.prune();
    } catch (error) {
      onError(error);
    }
  }, options.intervalMs ?? ONE_HOUR_MS);
  timer.unref();
  return () => clearInterval(timer);
}
```

- [ ] **Step 4: Integrate timer lifecycle and verify green**

In `apps/api/src/server.ts`, keep the startup `cache.prune()`, build the Fastify app, then start maintenance with an error callback that uses `app.log.error`. Invoke the returned stop function before closing the app and cache.

Run: `npm.cmd test -w @gal-toolbox/api -- src/cache-maintenance.test.ts`

Expected: 2 tests PASS.

Run: `npm.cmd test -w @gal-toolbox/api`

Expected: all API tests PASS.

- [ ] **Step 5: Commit cache maintenance**

```powershell
git add -- apps/api/src/cache-maintenance.ts apps/api/src/cache-maintenance.test.ts apps/api/src/server.ts
git commit -m "feat: prune expired cache entries hourly"
```

---

### Task 2: Single-Container Manual Deployment

**Files:**
- Create: `.dockerignore`
- Create: `Dockerfile`
- Create: `compose.yml`
- Create: `docs/deployment.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: the existing root `npm run build`, API `npm start`, health endpoint, and `server_proxy` network.
- Produces: image `gal-toolbox:local`, service/container `gal-toolbox`, named volume `gal_toolbox_data`, and a manual deployment/rollback runbook.

- [ ] **Step 1: Add the production container assets**

Create a Node 24 Alpine multi-stage `Dockerfile`. Install with `npm ci`, build both workspaces, prune development dependencies, copy the API and Web production artifacts, pre-create `/data` owned by the `node` user, switch to that user, and start `@gal-toolbox/api` on port `8787`.

Create `.dockerignore` excluding `.git`, `node_modules`, `dist`, coverage, logs, local SQLite files, output screenshots, and local environment files.

Create `compose.yml` with one service named `gal-toolbox`. Set `NODE_ENV=production`, `PORT=8787`, `CACHE_DB_PATH=/data/cache.sqlite`, and `VNDB_MIN_INTERVAL_MS=2000`; use `read_only: true`, `init: true`, `cap_drop: [ALL]`, `no-new-privileges`, the named data volume, external `server_proxy`, and a Node-based health check for `/api/v1/health`. Do not add `ports`.

- [ ] **Step 2: Document manual deploy and rollback**

Create `docs/deployment.md` with these exact operational boundaries:

- Upload `git archive HEAD` into `/srv/apps/gal-toolbox/releases/<full-commit-sha>`.
- Run `sudo docker compose -p gal-toolbox build` and `sudo docker compose -p gal-toolbox up -d` from that release.
- Verify Compose status, container logs, internal health, public health, homepage, and a real VNDB search.
- Roll back by entering the preceding release directory and running the same build/up commands.
- State that `gal_toolbox_data` is disposable, does not need backup, and may be removed only when intentionally resetting cache state.

Add a short production-deployment link to `README.md`.

- [ ] **Step 3: Validate application artifacts**

Run:

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd audit --audit-level=high
```

Expected: typecheck, all tests, and build exit 0; audit reports 0 high-severity vulnerabilities.

On the server release directory run:

```sh
sudo docker compose -p gal-toolbox config
sudo docker compose -p gal-toolbox build
sudo docker compose -p gal-toolbox up -d
sudo docker compose -p gal-toolbox ps
```

Expected: Compose renders, the image builds, and `gal-toolbox` becomes healthy without a published host port.

- [ ] **Step 4: Commit deployment assets**

```powershell
git add -- .dockerignore Dockerfile compose.yml docs/deployment.md README.md
git commit -m "feat: add manual Docker deployment"
```

---

### Task 3: Shared Caddy Route and Production Acceptance

**Files:**
- Create in `server-infra`: `infra/caddy/sites-available/gtool.caddy`
- Modify in `server-infra`: `docs/remote-sync-table.md`
- Create in `server-infra`: `docs/verification/gtool-production-acceptance.md`

**Interfaces:**
- Consumes: DNS `gtool.minyako.top -> 124.223.13.233`, the healthy `gal-toolbox:8787` service, and shared Caddy imports.
- Produces: public HTTPS origin `https://gtool.minyako.top` and a durable server inventory/acceptance record.

- [ ] **Step 1: Add and validate the Caddy route**

Create `infra/caddy/sites-available/gtool.caddy`:

```caddy
gtool.minyako.top {
    encode zstd gzip
    header {
        X-Content-Type-Options nosniff
        Referrer-Policy strict-origin-when-cross-origin
    }
    reverse_proxy gal-toolbox:8787
}
```

Copy it to `/srv/server-stack-prod/caddy/sites-enabled/gtool.caddy`, then run `caddy validate` inside `server-caddy` before reloading Caddy.

- [ ] **Step 2: Verify the public service**

Run public checks for:

```text
https://gtool.minyako.top/
https://gtool.minyako.top/api/v1/health
https://gtool.minyako.top/api/v1/search?type=vn&q=v17&page=1&pageSize=1
```

Expected: HTTP 200, health reports SQLite/API version 1, and search returns VNDB entry `v17`. Repeat the search and confirm `X-Cache: HIT`.

- [ ] **Step 3: Record inventory and acceptance evidence**

Add a `Gal Toolbox` row to `docs/remote-sync-table.md` with repository, local path, remote release path, `prod-ready` state, public endpoint, Compose/Caddy notes, disposable-cache backup policy, and rollback location. Record exact deployed commit, container health, HTTPS response, VNDB request, cache-hit evidence, logging command, and rollback command in `docs/verification/gtool-production-acceptance.md`.

- [ ] **Step 4: Commit infrastructure records**

```powershell
git add -- infra/caddy/sites-available/gtool.caddy docs/remote-sync-table.md docs/verification/gtool-production-acceptance.md
git commit -m "feat: route gtool production service"
```

---

### Task 4: Final Verification

**Files:**
- Modify only if verification finds a defect in files owned by Tasks 1-3.

**Interfaces:**
- Consumes: the application branch, server-infra branch, running container, Caddy route, and public DNS.
- Produces: final evidence that source, runtime, and public behavior agree.

- [ ] **Step 1: Re-run local application verification**

Run `npm.cmd run typecheck`, `npm.cmd test`, `npm.cmd run build`, and `npm.cmd audit --audit-level=high` from the application repository.

- [ ] **Step 2: Re-run server verification**

Check `docker compose ps`, recent application logs, Caddy validation, the internal health endpoint, public homepage, public health endpoint, first VNDB search, and repeated cache-hit search.

- [ ] **Step 3: Compare source and deployed revision**

Confirm the application acceptance record contains the same full commit SHA as `git rev-parse HEAD` and that both repositories have no uncommitted task-owned changes.
