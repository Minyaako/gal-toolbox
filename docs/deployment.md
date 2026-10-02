# Gal Toolbox Deployment

Gal Toolbox runs as one container behind the shared Caddy gateway. Production
does not use GitHub Actions and the server does not need GitHub credentials.

## Runtime layout

- Source releases: `/srv/apps/gal-toolbox/releases/<full-commit-sha>`
- Container: `gal-toolbox`
- Compose project: `gal-toolbox`
- Docker network: external `server_proxy`
- Persistent volume: `gal_toolbox_data` (cache plus accounts/rankings)
- Public origin: `https://gtool.minyako.top`

`/data/cache.sqlite` is replaceable VNDB cache. `/data/rankings.sqlite` contains
accounts, sessions and contributed rankings: **it is not disposable**. Never
delete `gal_toolbox_data` to clear cache. Keep backups outside this volume and
restrict access because they contain password hashes and user contributions.

## Ranking release prerequisites

- `RANKING_DB_PATH=/data/rankings.sqlite` must be on the persistent volume.
- `PUBLIC_ORIGIN=https://gtool.minyako.top` is the allowed browser mutation origin;
  change it for another deployment. Local development may set it to the Vite origin.
- `TRUST_PROXY_CIDRS=172.18.0.0/16` matches the server's `server_proxy` subnet
  (read-only verified 2026-10-02). Recheck with `docker network inspect server_proxy`
  when moving hosts; never reuse this subnet blindly. Numeric hop-only trust is
  deliberately unsupported. Caddy must overwrite untrusted forwarding headers. Do not expose the API
  port or put another proxy ahead of it without revisiting trusted-client-IP rules.
  All peer containers on `server_proxy` are within this trust boundary: do not attach
  untrusted workloads. If that assumption stops holding, isolate the gateway/API
  network or use a stable explicit proxy-address allowlist before enabling imports.
  Direct local deployments leave proxy trust disabled.
- Use HTTPS: production session cookies require it. Email addresses are not yet
  verified, and password recovery is not implemented; do not treat an account's
  email as proof of ownership or add email recovery without verification.
- Excel import quota is one reservation per client IP per 60 seconds; users sharing
  NAT share this limit. Search still follows VNDB's shared upstream scheduler.

## Back up persistent data before release

For the single-container first version, use a brief stopped-service backup. Run
on the server (not inside Docker Desktop's internal WSL distribution):

```sh
sudo mkdir -p /srv/backups/gal-toolbox
sudo chmod 700 /srv/backups/gal-toolbox
sudo docker stop gal-toolbox
sudo docker run --rm --network none --user 0:0 --entrypoint sh \
  -v gal_toolbox_data:/source:ro \
  -v /srv/backups/gal-toolbox:/backup \
  gal-toolbox:local -c 'umask 077; tar -czf /backup/state-$(date -u +%Y%m%dT%H%M%SZ).tgz -C /source .'
sudo docker start gal-toolbox
```

Run the start command even if backup fails; do not deploy until a valid archive
exists. The stopped copy includes SQLite WAL/SHM companions. Verify with
`sudo tar -tzf /srv/backups/gal-toolbox/<archive>.tgz` and copy it to a protected
off-server destination. Before first ranking deployment the archive may contain
only cache. Test restoration into a separate empty volume, never overwrite live
data for a backup test.

## Upload a release

Run these commands from the repository root in PowerShell:

```powershell
$releaseSha = git rev-parse HEAD
$archivePath = Join-Path $env:TEMP "gal-toolbox-$releaseSha.tar"
git archive --format=tar --output=$archivePath HEAD

ssh tencent-server "sudo mkdir -p /srv/apps/gal-toolbox/releases/$releaseSha && sudo chown ubuntu:ubuntu /srv/apps/gal-toolbox/releases/$releaseSha"
scp $archivePath "tencent-server:/tmp/gal-toolbox-$releaseSha.tar"
ssh tencent-server "tar -xf /tmp/gal-toolbox-$releaseSha.tar -C /srv/apps/gal-toolbox/releases/$releaseSha && rm /tmp/gal-toolbox-$releaseSha.tar"
```

Remove the local temporary archive after confirming the upload.

## Build and start

```powershell
ssh tencent-server "cd /srv/apps/gal-toolbox/releases/$releaseSha && sudo docker compose -p gal-toolbox config && sudo docker compose -p gal-toolbox build && sudo docker compose -p gal-toolbox up -d"
```

The service joins `server_proxy` and does not publish a host port.

## Install or update the Caddy route

Upload the repository-owned route, validate the full shared configuration, and
restart only the Caddy container after validation succeeds. The shared gateway
sets `admin off`, so the `caddy reload` command is intentionally unavailable.

```powershell
scp deploy/gtool.caddy tencent-server:/tmp/gtool.caddy
ssh tencent-server "sudo install -o root -g root -m 0644 /tmp/gtool.caddy /srv/server-stack-prod/caddy/sites-enabled/gtool.caddy && sudo docker exec server-caddy caddy validate --config /etc/caddy/Caddyfile && sudo docker restart server-caddy && rm /tmp/gtool.caddy"
```

## Verify

```powershell
ssh tencent-server "cd /srv/apps/gal-toolbox/releases/$releaseSha && sudo docker compose -p gal-toolbox ps && sudo docker compose -p gal-toolbox logs --tail=100 gal-toolbox"
curl.exe --fail --show-error https://gtool.minyako.top/api/v1/health
curl.exe --fail --show-error "https://gtool.minyako.top/api/v1/search?type=vn&q=v17&page=1&pageSize=1"
curl.exe --fail --show-error --dump-header - --output NUL "https://gtool.minyako.top/api/v1/search?type=vn&q=v17&page=1&pageSize=1"
```

The final repeated request must include `X-Cache: HIT`.

## Roll back

Choose the preceding release SHA and rebuild that immutable source directory:

```powershell
$previousSha = "<full-previous-commit-sha>"
ssh tencent-server "cd /srv/apps/gal-toolbox/releases/$previousSha && sudo docker compose -p gal-toolbox build && sudo docker compose -p gal-toolbox up -d && sudo docker compose -p gal-toolbox ps"
```

Inspect logs and repeat public checks after rollback. An older app can ignore the
new rankings database; retain it for the next upgrade. Never remove the volume
or ranking tables as part of rollback. If only cache is incompatible, stop the
service and reset only the explicitly identified cache files after backing up
persistent data. Restoring a rankings backup requires a maintenance window and
explicit confirmation of which newer contributions would be lost.
