# Gal Toolbox Deployment

Gal Toolbox runs as one container behind the shared Caddy gateway. Production
does not use GitHub Actions and the server does not need GitHub credentials.

## Runtime layout

- Source releases: `/srv/apps/gal-toolbox/releases/<full-commit-sha>`
- Container: `gal-toolbox`
- Compose project: `gal-toolbox`
- Docker network: external `server_proxy`
- Cache volume: `gal_toolbox_data`
- Public origin: `https://gtool.minyako.top`

The SQLite volume is disposable cache state. It does not require backup and can
be rebuilt from VNDB. Removing it is an explicit cache reset, not a normal
deployment step.

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
reload only after validation succeeds:

```powershell
scp deploy/gtool.caddy tencent-server:/tmp/gtool.caddy
ssh tencent-server "sudo install -o root -g root -m 0644 /tmp/gtool.caddy /srv/server-stack-prod/caddy/sites-enabled/gtool.caddy && sudo docker exec server-caddy caddy validate --config /etc/caddy/Caddyfile && sudo docker exec server-caddy caddy reload --config /etc/caddy/Caddyfile && rm /tmp/gtool.caddy"
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

Inspect logs and repeat the public checks after rollback. The cache volume is
compatible with the current cache schema; if it is ever incompatible, stop the
service, remove `gal_toolbox_data` deliberately, and start the release again.
