# Deployment Guide — QQ Hotpot BBQ

**Prod URL:** https://app.qqhotpotbbq.com  
**UAT URL:** https://uat.qqhotpotbbq.com  
**VPS IP:** 187.127.106.81 (Hostinger)  
**GitHub repo:** kaungsettshinnaing/qq-hotpot  

---

## Infrastructure overview

```
Internet → Traefik (external reverse proxy, TLS via Let's Encrypt)
              ├── app.qqhotpotbbq.com → prod app container (port 3000)
              └── uat.qqhotpotbbq.com → UAT app container (port 3000)

VPS directories:
  /opt/qq-hotpot        — production (tracks origin/main)
  /opt/qq-hotpot-uat    — UAT (tracks origin/uat)

Docker projects (both run on the same VPS, fully isolated):
  qq-hotpot (default)   — prod: services app + db
  qq-uat                — UAT: services app + db (--project-name qq-uat)

Networks:
  default        — db ↔ app within each stack
  traefik-public — external; shared with Traefik container
```

---

## Environments

### Production

| Item | Value |
|---|---|
| Domain | app.qqhotpotbbq.com |
| VPS dir | /opt/qq-hotpot |
| Compose file | docker-compose.yml |
| Env file | .env |
| DB volume | pgdata |
| Deploy trigger | Push to `main` branch → GitHub Actions auto-deploys |

### UAT

| Item | Value |
|---|---|
| Domain | uat.qqhotpotbbq.com |
| VPS dir | /opt/qq-hotpot-uat |
| Compose file | docker-compose.uat.yml |
| Env file | .env.uat |
| DB volume | pgdata_uat |
| Deploy trigger | Push to `uat` branch → GitHub Actions auto-deploys |

Both compose files set `NODE_OPTIONS: "--max-old-space-size=512"` on the app service to prevent OOM-driven 503s under RSC background polling.

---

## Git branch → environment mapping

| Branch | CI action | Deploys to |
|---|---|---|
| `main` | tsc + lint + Docker image build → push GHCR `:prod` → **auto SSH deploy** to prod | Production |
| `uat` | tsc + lint + Docker image build → push GHCR `:uat` → **auto SSH deploy** to UAT | UAT |

The CI build runs on both branches. Each branch publishes its own image tag (`:prod` / `:uat`) so the two environments never share a moving tag, and each deploy job pulls the image named by `APP_IMAGE` in that environment's env file. Both auto-deploys are gated by the `DEPLOY_ENABLED` repo variable — set it to `false` to pause all automatic deploys.

### Typical workflow

```
Develop locally → git push origin uat (from local machine)
               → CI auto-deploys UAT
               → test on UAT
               → git checkout main && git merge uat && git push origin main
               → CI auto-deploys prod
```

> **`git push` always runs on your LOCAL machine, never on the VPS.**  
> CI SSHes into the VPS to deploy; you never do it by hand. GitHub no longer accepts password auth — the local machine uses your configured SSH key or PAT.

---

## First-time VPS setup

### 1. SSH in

```bash
ssh root@187.127.106.81
```

### 2. Install Docker

```bash
apt update && apt install -y docker.io docker-compose-plugin
systemctl enable docker && systemctl start docker
```

### 3. Set up Traefik (once per VPS)

```bash
docker network create traefik-public
touch /opt/traefik/acme.json && chmod 600 /opt/traefik/acme.json

docker run -d \
  --name traefik \
  --network traefik-public \
  -p 80:80 -p 443:443 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /opt/traefik/acme.json:/acme.json \
  traefik:v3 \
  --providers.docker=true \
  --providers.docker.network=traefik-public \
  --entrypoints.web.address=:80 \
  --entrypoints.websecure.address=:443 \
  --entrypoints.web.http.redirections.entrypoint.to=websecure \
  --certificatesresolvers.letsencrypt.acme.httpchallenge=true \
  --certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web \
  --certificatesresolvers.letsencrypt.acme.email=kaungsettshinnaing@gmail.com \
  --certificatesresolvers.letsencrypt.acme.storage=/acme.json
```

### 4. Set up production

```bash
git clone https://github.com/kaungsettshinnaing/qq-hotpot.git /opt/qq-hotpot
cd /opt/qq-hotpot
cp .env.example .env && nano .env   # fill AUTH_SECRET, POSTGRES_*, APP_URL
docker compose up -d --build
docker compose exec app npx prisma db seed   # first time only
```

### 5. Set up UAT

```bash
git clone https://github.com/kaungsettshinnaing/qq-hotpot.git /opt/qq-hotpot-uat
cd /opt/qq-hotpot-uat
git fetch origin && git checkout -b uat --track origin/uat
cp .env.uat.example .env.uat && nano .env.uat   # fill AUTH_SECRET, POSTGRES_* (different from prod!)
docker compose -f docker-compose.uat.yml --project-name qq-uat --env-file .env.uat up -d --build
docker compose -f docker-compose.uat.yml --project-name qq-uat --env-file .env.uat exec app npx prisma db seed
```

---

## Routine operations

### Deploy UAT (automatic)

**On your local machine:**
```bash
git push origin uat
```

GitHub Actions builds the `:uat` image and SSH-deploys it to `/opt/qq-hotpot-uat`. No VPS step needed — schema changes are applied automatically via `prisma db push` (non-destructive; see note below).

### Deploy production (automatic)

**On your local machine:**
```bash
git checkout main
git merge uat --ff-only
git push origin main
```

GitHub Actions builds the `:prod` image and SSH-deploys it to `/opt/qq-hotpot`, then runs `prisma db push`. A schema change that would drop data fails the deploy instead of applying — run it once by hand in that case:
```bash
cd /opt/qq-hotpot
docker compose exec app npx prisma db push --accept-data-loss
```

### After a schema change (prisma/schema.prisma modified)

Run this **after** the docker rebuild completes (containers must be running):

```bash
# UAT
cd /opt/qq-hotpot-uat
docker compose -f docker-compose.uat.yml --project-name qq-uat --env-file .env.uat exec app npx prisma db push --accept-data-loss

# Production
cd /opt/qq-hotpot
docker compose exec app npx prisma db push --accept-data-loss
```

> This project uses `prisma db push` (not `prisma migrate deploy`). No migration history on VPS.

### Troubleshooting: a push didn't reach prod/UAT

The documented flow (§ "Deploy production/UAT (automatic)") depends on `DEPLOY_ENABLED = true` and a working SSH deploy job. In practice this has been observed to silently not fire — prod stayed on a build from days earlier despite several pushes to `main`, with no error surfaced anywhere obvious. Symptoms: `git log -1` in `/opt/qq-hotpot` shows the latest commit (the git pull step ran), but `docker inspect --format='{{.Created}}' $(docker compose images -q app)` shows an old timestamp (the image was never rebuilt/repulled) and `docker compose pull` fetches nothing new.

**First, check whether CI actually ran and deployed:** GitHub → repo → Actions tab, and confirm the `DEPLOY_ENABLED` repo variable is actually set to `true` (Settings → Secrets and variables → Actions → Variables) — if it's unset/false, the deploy job silently no-ops even though the build job still succeeds.

**If you need it live now and don't want to wait on CI**, bypass the registry entirely and build straight from the already-pulled source on the VPS:
```bash
cd /opt/qq-hotpot   # or /opt/qq-hotpot-uat with the dc-uat alias
git pull --ff-only
docker compose build app
docker compose up -d --force-recreate app
docker image prune -f
```
`docker compose up -d` alone (without `--force-recreate`) can no-op if Compose thinks nothing changed — `--force-recreate` guarantees the container actually restarts on the freshly built image. If the schema changed, also run `docker compose exec -T app npx prisma db push` (or `--accept-data-loss` for a destructive change) before or after this, per the schema-change section above.

### Reset UAT database (re-seed)

```bash
cd /opt/qq-hotpot-uat
docker compose -f docker-compose.uat.yml --project-name qq-uat --env-file .env.uat down -v
docker compose -f docker-compose.uat.yml --project-name qq-uat --env-file .env.uat up -d --build
docker compose -f docker-compose.uat.yml --project-name qq-uat --env-file .env.uat exec app npx prisma db seed
```

---

## GitHub Actions CI/CD

Workflow: `.github/workflows/deploy.yml`

**On push to `main` or `uat`** (build job runs on both):
1. `npm ci`
2. `npx prisma generate`
3. `tsc --noEmit`
4. `npm run lint`
5. Build + push Docker image to GHCR — `:prod` on `main`, `:uat` on `uat`, plus a short-SHA tag on both

**Deploy job (requires `DEPLOY_ENABLED = true`):**
6. `main` → SSH into `/opt/qq-hotpot` → `docker compose pull && up -d`, `prisma db push`, prune
7. `uat` → SSH into `/opt/qq-hotpot-uat` → `docker compose … pull && up -d`, `prisma db push`, prune

> `prisma db push` runs **without** `--accept-data-loss`, so a schema change that would drop data fails the deploy loudly instead of destroying it. Apply an intentionally destructive change once by hand (see "After a schema change" below).

### Required GitHub Secrets

| Secret | Value |
|---|---|
| `VPS_HOST` | `187.127.106.81` |
| `VPS_USER` | `root` |
| `VPS_SSH_KEY` | Private SSH key (ed25519) |
| `VPS_APP_DIR` | `/opt/qq-hotpot` (prod dir; UAT dir `/opt/qq-hotpot-uat` is hard-coded in the workflow) |
| `GHCR_PAT` | GitHub PAT with `read:packages` scope (VPS pulls private images) |

### Required GitHub Variables

| Variable | Value |
|---|---|
| `DEPLOY_ENABLED` | `true` |

---

## Useful VPS commands

```bash
# --- Production ---
cd /opt/qq-hotpot

docker compose logs -f app          # live app logs
docker compose ps                   # service status
docker compose restart app          # restart app only
docker compose exec db psql -U qquser -d qqdb   # psql
docker compose exec app npx prisma <cmd>        # any prisma command
docker stats                        # memory/CPU per container

# --- UAT ---
cd /opt/qq-hotpot-uat
alias dc-uat="docker compose -f docker-compose.uat.yml --project-name qq-uat --env-file .env.uat"

dc-uat logs -f app
dc-uat ps
dc-uat exec app npx prisma db seed

# --- VPS housekeeping ---
docker image prune -f               # remove dangling images
docker system df                    # disk usage
```

---

## Environment variables reference

| Var | Purpose |
|---|---|
| `AUTH_SECRET` | Signs session JWTs — long & random; different between prod and UAT |
| `DATABASE_URL` | Auto-composed from POSTGRES_* vars in docker-compose |
| `POSTGRES_USER` | PostgreSQL username |
| `POSTGRES_PASSWORD` | PostgreSQL password |
| `POSTGRES_DB` | Database name |
| `APP_URL` | Used in notifications/links (`https://app.qqhotpotbbq.com` or `https://uat.qqhotpotbbq.com`) |
| `TZ` | Timezone (`Asia/Yangon`) |
| `NODE_OPTIONS` | `--max-old-space-size=512` — caps Node.js heap; prevents OOM-driven 503s under RSC polling |
