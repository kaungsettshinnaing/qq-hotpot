# Deployment Guide — QQ Hotpot BBQ

**Live URL:** https://app.qqhotpotbbq.com  
**VPS IP:** 187.127.106.81 (Hostinger)  
**GitHub repo:** kaungsettshinnaing/qq-hotpot  

---

## Infrastructure overview

```
Internet → Traefik (external reverse proxy, handles TLS)
              └── app.qqhotpotbbq.com → app container (port 3000)

Docker services:
  db   — postgres:16, localhost-only (127.0.0.1:5432)
  app  — Next.js + Socket.IO, exposes port 3000 internally

Networks:
  default        — db ↔ app
  traefik-public — external network shared with Traefik container
```

Traefik is configured via **labels** on the `app` service in `docker-compose.yml`. It auto-provisions a Let's Encrypt TLS certificate for `app.qqhotpotbbq.com`.

---

## First-time VPS setup (do once)

### 1. SSH into the VPS

```bash
ssh root@187.127.106.81
```

### 2. Install Docker

```bash
apt update && apt install -y docker.io docker-compose-plugin
systemctl enable docker && systemctl start docker
```

### 3. Set up Traefik (if not already running)

Traefik needs to be running as a separate container on the `traefik-public` network before the app can start.

```bash
docker network create traefik-public

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

### 4. Clone the repo

```bash
git clone https://github.com/kaungsettshinnaing/qq-hotpot.git /opt/qq-hotpot
```

### 5. Create the `.env` file

```bash
cd /opt/qq-hotpot/qq-app
cp .env.example .env
nano .env
```

| Variable | Value |
|---|---|
| `AUTH_SECRET` | Long random string — run `openssl rand -base64 48` |
| `POSTGRES_PASSWORD` | Strong password of your choice |
| `POSTGRES_USER` | e.g. `qquser` |
| `POSTGRES_DB` | e.g. `qqdb` |
| `APP_URL` | `https://app.qqhotpotbbq.com` |
| `APP_IMAGE` | `ghcr.io/kaungsettshinnaing/qq-hotpot:latest` |
| `TZ` | `Asia/Yangon` |

### 6. Start the app

```bash
docker compose up -d --build
```

### 7. Seed the database (first time only)

```bash
docker compose exec app npx prisma db seed
```

---

## Updating after code changes

Auto-deploy is configured: every push to `main` triggers GitHub Actions → builds the image → pushes to GHCR → SSH deploys to the VPS.

### Manual update on the VPS

```bash
cd /opt/qq-hotpot/qq-app
git pull
docker compose pull
docker compose up -d
```

### After a schema change (`prisma/schema.prisma` modified)

```bash
docker compose exec app npx prisma db push
docker compose up -d --build
```

> **Note:** This project uses `prisma db push` (not `prisma migrate deploy`) for schema changes. The `.env` on the VPS does not have migration history.

---

## GitHub Actions CI/CD

Workflow file: `.github/workflows/deploy.yml`

On every push to `main`:
1. Typecheck (`tsc --noEmit`)
2. Build Docker image → push to `ghcr.io/kaungsettshinnaing/qq-hotpot:latest`
3. SSH into VPS → `docker compose pull && docker compose up -d`

### Required GitHub Secrets

Go to repo → **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `VPS_HOST` | `187.127.106.81` |
| `VPS_USER` | `root` |
| `VPS_SSH_KEY` | Private SSH key (ed25519) |
| `VPS_APP_DIR` | `/opt/qq-hotpot/qq-app` |
| `GHCR_PAT` | GitHub PAT with `read:packages` scope |

### Required GitHub Variables

| Variable | Value |
|---|---|
| `DEPLOY_ENABLED` | `true` |

---

## Useful commands on the VPS

```bash
# View live app logs
docker compose logs -f app

# View all service status
docker compose ps

# Restart app only
docker compose restart app

# Stop everything
docker compose down

# Connect to the database directly
docker compose exec db psql -U qquser -d qqdb

# Run a Prisma command
docker compose exec app npx prisma <command>

# Check disk usage
docker system df

# Clean up old images
docker image prune -f
```

---

## Environment variables reference

| Var | Purpose |
|---|---|
| `AUTH_SECRET` | Signs session JWTs — must be long & random in prod |
| `DATABASE_URL` | Auto-composed from POSTGRES_* vars in docker-compose |
| `POSTGRES_USER` | PostgreSQL username |
| `POSTGRES_PASSWORD` | PostgreSQL password |
| `POSTGRES_DB` | Database name |
| `APP_URL` | Used in notifications and absolute links (`https://app.qqhotpotbbq.com`) |
| `APP_IMAGE` | Docker image path (pulled by VPS on deploy) |
| `TZ` | Timezone (`Asia/Yangon`) |
