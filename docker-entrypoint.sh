#!/bin/sh

echo "→ Syncing database schema (prisma db push)…"
PUSH_LOG=$(npx prisma db push --accept-data-loss 2>&1)
PUSH_EXIT=$?

echo "$PUSH_LOG"

if [ $PUSH_EXIT -ne 0 ]; then
  if echo "$PUSH_LOG" | grep -q "already exists"; then
    echo "→ Some columns already exist — applying idempotent SQL fix then retrying…"
    npx prisma db execute --stdin <<'SQL'
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "confirmedAt" TIMESTAMP(3);
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "confirmedById" TEXT;
CREATE INDEX IF NOT EXISTS "Expense_confirmedAt_idx" ON "Expense"("confirmedAt");
SQL
    echo "→ Retrying prisma db push…"
    npx prisma db push --accept-data-loss
  else
    echo "→ Schema push failed. Aborting."
    exit 1
  fi
fi

echo "→ Starting QQ Hotpot BBQ app…"
exec "$@"
