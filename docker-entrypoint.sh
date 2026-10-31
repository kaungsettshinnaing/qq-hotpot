#!/bin/sh

echo "→ Syncing database schema (prisma db push)…"
PUSH_LOG=$(npx prisma db push --accept-data-loss 2>&1)
PUSH_EXIT=$?

echo "$PUSH_LOG"

if [ $PUSH_EXIT -ne 0 ]; then
  if echo "$PUSH_LOG" | grep -q "already exists"; then
    echo "→ Some columns already exist — applying idempotent SQL fix then retrying…"
    npx prisma db execute --schema prisma/schema.prisma --stdin <<'SQL'
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "confirmedAt" TIMESTAMP(3);
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "confirmedById" TEXT;
CREATE INDEX IF NOT EXISTS "Expense_confirmedAt_idx" ON "Expense"("confirmedAt");
ALTER TABLE "TableSession" ADD COLUMN IF NOT EXISTS "billTotal" INTEGER;
SQL
    echo "→ Retrying prisma db push…"
    npx prisma db push --accept-data-loss
  else
    echo "→ Schema push failed. Aborting."
    exit 1
  fi
fi

# Special buffet prices live on two reserved menu codes. Prod first had them as
# ordinary admin-made items (SPECIAL / SPECIAL_1, never ordered), so adopt those
# once; anywhere else create blank rows for an admin to price. Idempotent.
echo "→ Ensuring special buffet menu rows…"
npx prisma db execute --schema prisma/schema.prisma --stdin <<'SQL' || echo "→ Special buffet rows step failed (app still starts; set them in Admin → Menu)."
UPDATE "MenuItem" SET code = 'SPECIAL_ADULT'
 WHERE code = 'SPECIAL' AND name ILIKE '%special%'
   AND (name ILIKE '%adult%' OR name LIKE '%လူကြီး%')
   AND NOT EXISTS (SELECT 1 FROM "MenuItem" WHERE code = 'SPECIAL_ADULT')
   AND NOT EXISTS (SELECT 1 FROM "OrderItem" WHERE "itemCode" = 'SPECIAL');
UPDATE "MenuItem" SET code = 'SPECIAL_CHILD'
 WHERE code = 'SPECIAL_1' AND name ILIKE '%special%'
   AND (name ILIKE '%child%' OR name LIKE '%လေး%')
   AND NOT EXISTS (SELECT 1 FROM "MenuItem" WHERE code = 'SPECIAL_CHILD')
   AND NOT EXISTS (SELECT 1 FROM "OrderItem" WHERE "itemCode" = 'SPECIAL_1');
INSERT INTO "MenuItem" (id, code, name, category, unit, price, "isActive")
VALUES (gen_random_uuid()::text, 'SPECIAL_ADULT', 'Special Adult Buffet', 'Main', 'UNIT', 0, true),
       (gen_random_uuid()::text, 'SPECIAL_CHILD', 'Special Child Buffet', 'Main', 'UNIT', 0, true)
ON CONFLICT (code) DO NOTHING;
SQL

echo "→ Starting QQ Hotpot BBQ app…"
exec "$@"
