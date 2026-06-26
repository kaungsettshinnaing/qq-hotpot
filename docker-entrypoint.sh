#!/bin/sh
set -e

echo "→ Syncing database schema (prisma db push)…"
npx prisma db push --accept-data-loss

echo "→ Starting QQ Hotpot BBQ app…"
exec "$@"
