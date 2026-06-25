#!/usr/bin/env bash
#
# QQ Hotpot BBQ — one-shot VPS bootstrap (Ubuntu/Debian Hostinger VPS).
# Idempotent: safe to re-run. Run as root or a sudo user.
#
#   REPO_URL=https://github.com/<you>/<repo>.git ./bootstrap-vps.sh
#
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/qq-app}"
REPO_URL="${REPO_URL:-}"

echo "==> QQ Hotpot BBQ VPS bootstrap"

# 1) Docker -----------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  echo "==> Installing Docker…"
  curl -fsSL https://get.docker.com | sh
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "!! Docker Compose plugin missing. Install 'docker-compose-plugin' and re-run."
  exit 1
fi

# 2) Code -------------------------------------------------------------------
if [ -n "$REPO_URL" ]; then
  if [ ! -d "$APP_DIR/.git" ]; then
    echo "==> Cloning $REPO_URL -> $APP_DIR"
    git clone "$REPO_URL" "$APP_DIR"
  else
    echo "==> Updating repo in $APP_DIR"
    git -C "$APP_DIR" pull --ff-only || true
  fi
fi

# The app lives in the qq-app/ subfolder of the repo.
if [ -d "$APP_DIR/qq-app" ]; then
  cd "$APP_DIR/qq-app"
else
  cd "$APP_DIR"
fi
echo "==> Working dir: $(pwd)"

# 3) Environment ------------------------------------------------------------
if [ ! -f .env ]; then
  echo "==> Creating .env from template"
  cp .env.example .env
  SECRET="$(openssl rand -base64 48 | tr -d '\n')"
  # Portable in-place edit
  sed -i.bak "s|^AUTH_SECRET=.*|AUTH_SECRET=${SECRET}|" .env && rm -f .env.bak
  echo ""
  echo "  ⚠  Edit .env and set: APP_DOMAIN, ACME_EMAIL, POSTGRES_PASSWORD, APP_IMAGE"
  echo "     (APP_IMAGE = ghcr.io/<owner-lowercase>/<repo-lowercase>:latest)"
  echo "     Then re-run this script."
  exit 0
fi

# 4) Start stack ------------------------------------------------------------
echo "==> Pulling images (if published) and starting…"
docker compose pull 2>/dev/null || true
docker compose up -d --build

# 5) Seed once (idempotent) -------------------------------------------------
echo "==> Waiting for the app to come up…"
for i in $(seq 1 30); do
  if docker compose exec -T app node -e "process.exit(0)" >/dev/null 2>&1; then break; fi
  sleep 2
done
echo "==> Seeding database (idempotent)…"
docker compose exec -T app npm run db:seed || echo "!! Seed skipped/failed — run manually: docker compose exec app npm run db:seed"

DOMAIN="$(grep -E '^APP_DOMAIN=' .env | cut -d= -f2)"
echo ""
echo "==> Done. Once DNS for ${DOMAIN} points at this server, open: https://${DOMAIN}"
echo "    Default admin login: admin / admin123  (change it in Admin → Users)"
