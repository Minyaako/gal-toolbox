# Gtool Production Acceptance

Status: `prod-ready`
Verified: 2026-08-11 (Asia/Shanghai)

## Release identity

- Repository: `https://github.com/Minyaako/gal-toolbox`
- Local implementation worktree: `D:\seRver\.worktrees\gal-toolbox-gtool-deployment`
- Deployed commit: `e8b184b3778b3b17d519f778f4adc5828d674c45`
- Remote release: `/srv/apps/gal-toolbox/releases/e8b184b3778b3b17d519f778f4adc5828d674c45`
- Image: `gal-toolbox:local`
- Image ID: `sha256:f5eb29839e7c86307abf01bd51a28f0a76ff7eb2be47e29914f8bc412afcbc68`
- Public origin: `https://gtool.minyako.top`

## Runtime evidence

- `docker compose -p gal-toolbox config` rendered successfully on the server.
- The production image built successfully with Node 24 Alpine.
- Container `gal-toolbox` reports `healthy`.
- The image runs as user `node` with a read-only root filesystem.
- `docker port gal-toolbox` returns no mapping; the service is reachable only
  through the external `server_proxy` network.
- SQLite cache state is mounted from named volume `gal_toolbox_data` at `/data`.
- The shared Caddy configuration validates successfully and owns a valid
  Let's Encrypt certificate for `gtool.minyako.top`.
- Existing `https://gsk.minyako.top` and `https://editor.minyako.top` origins
  still returned HTTP 200 after the Caddy restart.

## Public acceptance

- `GET /` returned HTTP 200 with `text/html; charset=utf-8`.
- `GET /api/v1/health` returned HTTP 200 and
  `{"status":"ok","cache":"sqlite","apiVersion":1}`.
- A real `v17` VNDB search returned HTTP 200.
- Repeating the same search returned `X-Cache: HIT`.
- Response headers include `X-Content-Type-Options: nosniff` and
  `Referrer-Policy: strict-origin-when-cross-origin`.

## Cache maintenance

- `startCacheMaintenance()` is covered by fake-timer tests proving it invokes
  `CacheStore.prune()` once per hour, stops when requested, and reports cleanup
  failures without terminating the process.
- `CacheStore.prune()` retains entries expired less than seven days for `STALE`
  fallback and deletes older expired rows.
- The cache volume is disposable and has no backup requirement.

## Issues found and resolved during deployment

- The first live VNDB search encountered an outbound connection timeout. The
  original build returned HTTP 500 because native fetch failures were not
  wrapped as upstream errors. A failing regression test reproduced the defect;
  deployed commit `e8b184b...` includes the fix and maps it to HTTP 502
  `UPSTREAM_UNAVAILABLE` when no stale cache is available.
- `caddy reload` failed because the shared gateway intentionally sets
  `admin off`. The validated operational path is now `docker restart
  server-caddy`; the application runbook records that behavior.

## Operations and rollback

Inspect the service:

```sh
cd /srv/apps/gal-toolbox/releases/e8b184b3778b3b17d519f778f4adc5828d674c45
sudo docker compose -p gal-toolbox ps
sudo docker compose -p gal-toolbox logs --tail=100 gal-toolbox
```

The preceding release remains at
`/srv/apps/gal-toolbox/releases/ba2d61aa22a0cfcffc48b95d71a62adad07f08b8`.
It can be rebuilt with the same Compose project for emergency rollback, though
it predates the VNDB network-error mapping fix. To withdraw the public service,
stop the Compose project, remove only
`/srv/server-stack-prod/caddy/sites-enabled/gtool.caddy`, validate Caddy, and
restart `server-caddy`. Do not remove the shared Caddy volumes.
