# Gtool Production Deployment Design

Status: approved
Date: 2026-08-11

## Goal

Deploy Gal Toolbox at `https://gtool.minyako.top` on the existing Tencent Cloud
server without adding an automated publishing pipeline or unnecessary runtime
services.

## Architecture

One Node.js container serves both the built React application and the Fastify
API on port `8787`. The container joins the existing external
`server_proxy` Docker network and does not publish a host port. The shared Caddy
gateway terminates HTTPS and proxies `gtool.minyako.top` to
`gal-toolbox:8787`.

The application keeps its SQLite HTTP cache at `/data/cache.sqlite` on a named
Docker volume. The cache contains no irreplaceable business data and may be
discarded and rebuilt from VNDB.

## Cache Maintenance

The API process starts one in-process maintenance timer after opening the
cache. Once per hour it calls the existing `CacheStore.prune()` method. The
existing retention rule remains unchanged: cached responses that expired less
than seven days ago remain available for `STALE` fallback, while older expired
rows are deleted.

The timer is stopped during graceful shutdown before the cache is closed. No
cron process, Redis instance, worker container, or maintenance endpoint is
introduced.

## Container and Runtime

- Use a multi-stage Dockerfile based on a Node.js version satisfying
  `node >=22.5`.
- Build the Web and API workspaces, then run only the production application.
- Set `NODE_ENV=production`, `PORT=8787`,
  `CACHE_DB_PATH=/data/cache.sqlite`, and `VNDB_MIN_INTERVAL_MS=2000`.
- Run as a non-root user with a read-only root filesystem and a writable named
  volume mounted at `/data`.
- Add a container health check against `/api/v1/health`.
- Use `restart: unless-stopped` and connect only to `server_proxy`.

## Manual Deployment

GitHub Actions and automatic publishing are out of scope. The deployment source
is uploaded from the trusted local checkout to `/srv/apps/gal-toolbox`, then
built and started on the server with Docker Compose. This avoids storing a
GitHub token or private deploy key on the server.

The application repository owns its Dockerfile, Compose file, ignore rules, and
deployment runbook. The `server-infra` repository owns the shared Caddy route
and the high-level remote synchronization record.

## Error Handling and Operations

- A cleanup failure is logged but must not terminate the Web service.
- Normal shutdown clears the maintenance timer and closes SQLite cleanly.
- Operators inspect runtime state with `docker compose ps`, the health endpoint,
  and `docker compose logs`.
- Rollback consists of restoring the previous uploaded source release and
  rebuilding/restarting the Compose service. The cache volume is compatible
  across these releases and is safe to recreate if necessary.

## Verification

- A timer-focused unit test proves that cleanup runs after one hour and stops
  after shutdown.
- Existing API and Web tests remain passing.
- Type checking, production build, and dependency audit pass.
- Docker Compose configuration renders successfully on the server.
- The deployed health endpoint and `https://gtool.minyako.top` return HTTP 200,
  and a real VNDB search succeeds through the public origin.

## Non-Goals

- Automated image publishing or deployment.
- Multiple application replicas or shared cache coordination.
- Permanent mirroring of VNDB images.
- Redis, PostgreSQL, cron, or a separate cleanup service.
