# Deployment Guide — QQ Hotpot BBQ

VPS IP: **187.127.106.81** (Hostinger)  
GitHub repo: **kaungsettshinnaing/qq-hotpot**  
Domain (pending transfer): qqhotpotbbq.com

---

## Phase 1 — Deploy via IP (domain not ready yet)

The app will be accessible at **http://187.127.106.81** over plain HTTP.  
When the domain transfer completes, see Phase 2 at the bottom.

---

### Step 1 — First-time VPS setup (do once only)

SSH into your VPS:
```bash
ssh root@187.127.106.81
```

Install Docker and Docker Compose:
```bash
apt update && apt install -y docker.io docker-compose-plugin
systemctl enable docker && systemctl start docker
```

Clone your repo onto the VPS:
```bash
git clone https://github.com/kaungsettshinnaing/qq-hotpot.git /opt/qq-hotpot
```

---

### Step 2 — Create the `.env` file on the VPS

```bash
cd /opt/qq-hotpot/qq-app
cp .env.example .env
nano .env
```

Fill in these values (everything else can stay as-is for now):

| Variable | Value to set |
|---|---|
| `AUTH_SECRET` | A long random string — run `openssl rand -base64 48` to generate one |
| `POSTGRES_PASSWORD` | A strong password of your choice |
| `APP_DOMAIN` | `187.127.106.81` |
| `APP_URL` | `http://187.127.106.81` |
| `APP_IMAGE` | `ghcr.io/kaungsettshinnaing/qq-hotpot:latest` |

Save and close (`Ctrl+X`, then `Y`, then `Enter` in nano).

---

### Step 3 — Run the first deployment

```bash
cd /opt/qq-hotpot/qq-app
docker compose pull
docker compose up -d
```

Wait about 30 seconds, then check everything is running:
```bash
docker compose ps
```

You should see `db`, `app`, and `caddy` all showing `Up`.

---

### Step 4 — Run database migrations

This needs to run once after the first deployment (and again after any schema change):

```bash
docker compose exec app npx prisma migrate deploy
```

---

### Step 5 — Seed initial data (first time only)

This creates the default ADMIN user and menu categories:

```bash
docker compose exec app npx prisma db seed
```

---

### Step 6 — Test it

Open your browser and go to: **http://187.127.106.81**

Log in with the default ADMIN credentials set in `prisma/seed.ts`.

---

## GitHub Actions — automatic deploys on push

Every time you push to `main`, GitHub Actions will:
1. Build and typecheck the app
2. Build a Docker image and push it to `ghcr.io/kaungsettshinnaing/qq-hotpot:latest`
3. SSH into your VPS and run `docker compose pull && docker compose up -d`

### Configure GitHub Secrets (one-time setup)

Go to your repo → **Settings → Secrets and variables → Actions** and add:

| Secret name | Value |
|---|---|
| `VPS_HOST` | `187.127.106.81` |
| `VPS_USER` | `root` |
| `VPS_SSH_KEY` | Your private SSH key (see note below) |
| `VPS_APP_DIR` | `/opt/qq-hotpot/qq-app` |
| `GHCR_PAT` | A GitHub Personal Access Token with `read:packages` scope |

Then go to **Settings → Variables → Actions** and add:

| Variable name | Value |
|---|---|
| `DEPLOY_ENABLED` | `true` |

**How to get your SSH key for `VPS_SSH_KEY`:**  
If you SSH into the VPS using a password, generate a key pair:
```bash
# On your LOCAL machine (not the VPS):
ssh-keygen -t ed25519 -C "github-deploy" -f ~/.ssh/qq_deploy
# Copy the public key to the VPS:
ssh-copy-id -i ~/.ssh/qq_deploy.pub root@187.127.106.81
# Then paste the PRIVATE key (~/.ssh/qq_deploy) into the VPS_SSH_KEY secret.
```

---

## Updating the app after code changes

If auto-deploy is set up (Step above), just push to `main` — it deploys automatically.

For a manual update on the VPS:
```bash
cd /opt/qq-hotpot/qq-app
git pull
docker compose pull
docker compose up -d
# If schema changed:
docker compose exec app npx prisma migrate deploy
```

---

## Phase 2 — Switch to domain + HTTPS (when qqhotpotbbq.com transfer completes)

1. Point the domain's A record to `187.127.106.81` in your DNS registrar.
2. Wait for DNS to propagate (usually 10–60 minutes).
3. SSH into the VPS and edit `.env`:
   ```bash
   cd /opt/qq-hotpot/qq-app
   nano .env
   ```
   Change:
   ```
   APP_DOMAIN=qqhotpotbbq.com
   APP_URL=https://qqhotpotbbq.com
   ```
4. Restart Caddy to pick up the new domain (it will auto-provision the HTTPS cert):
   ```bash
   docker compose restart caddy
   ```
5. Update `VPS_HOST` GitHub secret to the domain if you prefer (optional — the IP still works).

Caddy will automatically obtain a free Let's Encrypt HTTPS certificate. No manual cert setup needed.

---

## Useful commands on the VPS

```bash
# View live logs
docker compose logs -f app

# View Caddy logs
docker compose logs -f caddy

# Restart everything
docker compose restart

# Stop everything
docker compose down

# Check disk usage
docker system df

# Clean up old images
docker image prune -f
```
