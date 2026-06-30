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
| Deploy trigger | Manual — push to `uat` branch triggers CI build, then SSH to VPS to rebuild |

Both compose files set `NODE_OPTIONS: "--max-old-space-size=512"` on the app service to prevent OOM-driven 503s under RSC background polling.

---

## Git branch → environment mapping

| Branch | CI action | Deploys to |
|---|---|---|
| `main` | tsc + lint + Docker image build → push GHCR → **auto SSH deploy** to prod | Production |
| `uat` | tsc + lint + Docker image build → push GHCR → **no auto-deploy** | UAT (manual rebuild) |

The CI build runs on both branches. Auto-deploy to production only happens from `main` (controlled by `DEPLOY_ENABLED` repo variable).

### Typical workflow

```
Develop locally → git push origin uat (from local machine)
               → SSH into VPS → git pull + docker rebuild + prisma db push
               → test on UAT
               → git checkout main && git merge uat && git push origin main
               → CI auto-deploys prod → SSH into VPS → prisma db push
```

> **`git push` always runs on your LOCAL machine, never on the VPS.**  
> The VPS only ever runs `git pull`. GitHub no longer accepts password auth — the local machine uses your configured SSH key or PAT.

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

### Deploy UAT (manual)

**On your local machine:**
```bash
git push origin uat
```

Wait for GitHub Actions CI build to go green, then **on the VPS:**
```bash
cd /opt/qq-hotpot-uat
git pull --ff-only
docker compose -f docker-compose.uat.yml --project-name qq-uat --env-file .env.uat up -d --build
docker image prune -f
```

### Deploy production (automatic)

**On your local machine:**
```bash
git checkout main
git merge uat --ff-only
git push origin main
```

GitHub Actions handles the build + deploy. Once the Actions tab shows green, schema changes still need a manual push:
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
5. Build + push Docker image to `ghcr.io/kaungsettshinnaing/qq-hotpot:latest` + short SHA tag

**On push to `main` only** (deploy job, requires `DEPLOY_ENABLED = true`):
6. SSH into VPS → `git pull`, `docker compose pull`, `docker compose up -d`, `docker image prune -f`

### Required GitHub Secrets

| Secret | Value |
|---|---|
| `VPS_HOST` | `187.127.106.81` |
| `VPS_USER` | `root` |
| `VPS_SSH_KEY` | Private SSH key (ed25519) |
| `VPS_APP_DIR` | `/opt/qq-hotpot` |
| `GHCR_PAT` | GitHub PAT with `read:packages` scope |

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
