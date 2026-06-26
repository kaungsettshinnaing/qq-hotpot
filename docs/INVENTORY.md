# Inventory Module — Developer Reference

## Overview

The inventory module tracks stock purchases (deliveries from suppliers), reconciles physical counts against invoices using a **blind-count** system to catch pilferage or delivery errors, records stock consumption, and provides supplier spend reports. It integrates with the cashier expense system — every stock purchase auto-creates an `Expense` record.

---

## Role access map

| Route | Roles |
|---|---|
| `/admin/stock-items` | ADMIN |
| `/admin/suppliers` | ADMIN |
| `/inventory` (all sub-routes) | CASHIER, WAITER, KITCHEN, MANAGER, ADMIN |
| `/inventory/deliveries/[id]/cashier` | CASHIER, MANAGER, ADMIN |
| `/inventory/deliveries/[id]/counter` | WAITER, KITCHEN, MANAGER, ADMIN |
| `/manager/inventory` | MANAGER, ADMIN |

KITCHEN role was extended to include `/inventory` (allows kitchen staff to count stock and record usage, in addition to the kitchen display).

---

## Data models

### `Supplier`
Vendor records. Admin-created.

```
id, name, contact?, phone?, address?, notes?, isActive, createdAt
→ deliveries: StockDelivery[]
```

### `StockItem`
Inventory items (separate from menu items — these are what you buy, not what guests order).

```
id, name, unit (StockUnit), minStock?, optimalStock?, isActive, createdAt
→ deliveryItems: StockDeliveryItem[]
→ movements: StockMovement[]
```

`minStock` → triggers "Low Stock" red alert on dashboard.
`optimalStock` → shows "order quantity = optimalStock − currentStock".

### `StockDelivery`
A purchase/delivery event. Has two independent sides (cashier invoice + counter physical count).

```
id, deliveryDate, invoiceNo?
supplierId?                        → Supplier
status: DeliveryStatus
paymentStatus: PaymentStatus
prepaidAt?                         → when pre-payment was made

parentDeliveryId?                  → StockDelivery (for batch deliveries)
batches: StockDelivery[]           → follow-up batches

cashierEnteredById?, cashierSubmittedAt?, totalCost?, paymentSource?, expenseId?
counterEnteredById?, counterSubmittedAt?
resolvedById?, resolvedAt?, resolutionNote?
createdById, createdAt
```

### `StockDeliveryItem`
Line items within a delivery. Both cashier and counter write to the same rows.

```
id, deliveryId, stockItemId
orderedQty?   → total qty on purchase order (may span multiple batches)
cashierQty?   → this batch, from invoice
counterQty?   → this batch, from physical count
finalQty?     → set on COMPLETE/PARTIAL
unitCost?     → MMK per unit
@@unique([deliveryId, stockItemId])
```

### `StockDeliveryLog`
Immutable audit trail for every state transition.

```
id, deliveryId, actorId, action (string), note?, createdAt
```
Actions: `CREATED`, `PREPAID`, `CASHIER_SUBMITTED`, `COUNTER_SUBMITTED`, `DISCREPANCY_FLAGGED`, `AUTO_COMPLETED`, `MANAGER_RESOLVED`, `MARKED_PARTIAL`

### `StockMovement`
All stock-in and stock-out events. Current stock level is always computed from movements (no cached field).

```
id, stockItemId, type (MovementType), qty (positive=in, negative=out)
note?, deliveryId? (for DELIVERY_IN), recordedById, createdAt
```

### `ExpenseCategory` (updated)
Added `isStock Boolean @default(false)` — admin marks categories as stock-purchase types. Stock expense categories appear in the cashier invoice entry dropdown.

---

## Enums

```
StockUnit:      UNIT | GRAM | KG | LITRE | BOX | BOTTLE | PACK
DeliveryStatus: DRAFT | PREPAID | OPEN | PENDING_REVIEW | PARTIAL | COMPLETE
PaymentStatus:  UNPAID | PREPAID | PAID
MovementType:   DELIVERY_IN | USAGE_OUT | ADJUSTMENT
```

### DeliveryStatus flow

```
DRAFT
  ├─ someone records pre-payment → PREPAID
  │     └─ goods arrive, both sides submit → OPEN → compare → COMPLETE / PENDING_REVIEW
  └─ cashier or counter submits first → OPEN
        ├─ second side submits, all match → COMPLETE
        ├─ second side submits, mismatch → PENDING_REVIEW → manager resolves → COMPLETE or PARTIAL
        └─ manager marks partial → PARTIAL → new batch delivery created → repeat
```

---

## Stock level formula

Stock level is NOT stored. Always computed on read:

```
currentStock(itemId) = Σ DELIVERY_IN qty + Σ USAGE_OUT qty + Σ ADJUSTMENT qty
                     = Σ all StockMovement.qty WHERE stockItemId = itemId
```
(USAGE_OUT movements are stored as negative integers, so this is just a sum.)

```typescript
// src/lib/inventory.ts
computeStockLevel(itemId)       // single item
computeAllStockLevels()         // returns Map<stockItemId, level> via groupBy
```

---

## Delivery reconciliation logic

Located in `src/app/(app)/inventory/deliveries/[id]/actions.ts`.

### `createDelivery(formData)`
Creates the delivery header. Either party can call this. Logs `CREATED`. Redirects to detail page.

### `recordPrepayment(formData)`
CASHIER/MANAGER/ADMIN only. Called when paying upfront before goods arrive.
- Creates `Expense` record immediately (cash flow captured at payment time)
- Sets `paymentStatus = PREPAID`, `status = PREPAID`
- Logs `PREPAID`

### `submitCashierSide(formData)`
CASHIER/MANAGER/ADMIN only. Invoice quantities + costs.
- Upserts `StockDeliveryItem` rows with `cashierQty`, `orderedQty`, `unitCost`
- If not pre-paid: creates `Expense` record now
- Sets `paymentStatus = PAID`
- If counter already submitted → calls `runComparison()`

### `submitCounterSide(formData)`
WAITER/KITCHEN/MANAGER/ADMIN. Blind physical count.
- Upserts `StockDeliveryItem` rows with `counterQty` (cannot see cashier's qty)
- If cashier already submitted → calls `runComparison()`

### `runComparison(deliveryId, actorId)` (internal)
- All `cashierQty === counterQty` → auto-COMPLETE, creates `StockMovement` DELIVERY_IN per item, logs `AUTO_COMPLETED`
- Any mismatch → PENDING_REVIEW, logs `DISCREPANCY_FLAGGED`

### `resolveDelivery(formData)`
MANAGER/ADMIN only. Sets `final_${itemId}` per item, creates `StockMovement` records, logs `MANAGER_RESOLVED` or `MARKED_PARTIAL`.
- `isPartial = "on"` → status = `PARTIAL` (link to original shown on delivery page, "+ Add next batch" button available)

---

## Pre-payment flow

1. Create delivery (either party)
2. Cashier clicks "Record pre-payment" on the detail page or navigates to `/inventory/deliveries/[id]/cashier?mode=prepay`
3. Cashier enters total amount + category + payment method
4. `recordPrepayment()` creates expense + sets `status = PREPAID`
5. Goods stay at vendor — delivery is visible in Manager Inventory as "Pre-paid awaiting delivery"
6. When goods arrive: counter goes to delivery, clicks "Count received items"
7. Cashier still enters the invoice items/quantities via the cashier panel
8. Normal comparison runs, delivery completes

---

## Partial delivery flow

1. Delivery reaches `PENDING_REVIEW` or both sides submit
2. Manager ticks "Partial delivery — more items expected" in the resolution form
3. `resolveDelivery()` sets `status = PARTIAL`, creates movements for `finalQty` received so far
4. On the delivery detail page, "+ Add next batch" button appears → links to `/inventory/deliveries/new?parentId=[id]`
5. New batch delivery has `parentDeliveryId` set; it goes through its own cashier+counter flow independently
6. Each batch's `finalQty` is added to stock when it completes

---

## File map

```
prisma/schema.prisma              # StockUnit/DeliveryStatus/PaymentStatus/MovementType enums
                                  # Supplier, StockItem, StockDelivery, StockDeliveryItem,
                                  # StockDeliveryLog, StockMovement models
                                  # ExpenseCategory.isStock field
src/lib/inventory.ts              # computeStockLevel(), computeAllStockLevels()
src/lib/rbac.ts                   # inventory module + routes added; KITCHEN extended

src/app/(app)/admin/
  layout.tsx                      # "Stock Items" + "Suppliers" tabs added
  categories/page.tsx             # isStock toggle column + checkbox on add form
  actions.ts                      # toggleCategoryStock() added
  stock-items/
    page.tsx                      # list with current stock, edit in-place
    actions.ts                    # createStockItem, updateStockItem, toggleStockItem
  suppliers/
    page.tsx                      # list with total spend, edit in-place
    actions.ts                    # createSupplier, updateSupplier, toggleSupplier

src/app/(app)/inventory/
  layout.tsx                      # tab nav: Stock Levels | Deliveries | Usage | Reports
  page.tsx                        # dashboard: low-stock alerts, stock table, pre-paid count
  deliveries/
    page.tsx                      # delivery list
    new/page.tsx                  # create delivery header (also accepts parentId for batches)
    [id]/
      page.tsx                    # detail: cashier panel + counter panel + audit log
      cashier/page.tsx            # invoice entry form (also ?mode=prepay for pre-payment)
      counter/page.tsx            # blind count form
      actions.ts                  # createDelivery, recordPrepayment, submitCashierSide,
                                  # submitCounterSide, runComparison (internal), resolveDelivery
  usage/
    page.tsx                      # movement log + manager adjustment form
    new/page.tsx                  # record usage (USAGE_OUT)
    actions.ts                    # recordUsage, recordAdjustment
  reports/
    page.tsx                      # supplier spend + stock consumption by period

src/app/(app)/manager/
  layout.tsx                      # "Inventory" tab added
  inventory/page.tsx              # discrepancy list + per-delivery resolution form
                                  # + pre-paid awaiting delivery list
```

---

## Business rules (key invariants)

1. **Expense at payment time**: `Expense` is created when `recordPrepayment` or `submitCashierSide` runs — not when goods are received or counted.
2. **StockMovement only on COMPLETE or PARTIAL resolution** — never on OPEN or PENDING_REVIEW. This prevents phantom stock from unresolved discrepancies.
3. **Counter cannot see cashier quantities** — the counter page fetches only `stockItem.name` and `stockItem.unit`, never `cashierQty`.
4. **First submitter defines items** — if cashier goes first, counter sees exactly those items. If counter goes first (before cashier), counter sees all active stock items.
5. **Partial batch link** — when a delivery is marked PARTIAL, `StockMovement` is created for `finalQty` (what was received in this batch). The remaining expected qty is tracked via `orderedQty` on the parent delivery's items.
6. **`optimalStock` is informational only** — it does not trigger automatic orders. It shows on the dashboard as "order X to reach optimal".

---

## Seed data (prisma/seed.ts)

- 2 suppliers: "ABC Beverages", "Fresh Market Co."
- 8 stock items: Dagon Beer Bottle (BOTTLE, min 24, opt 120), Myanmar Beer Bottle, Cooking Oil 5L, LP Gas Cylinder, Fresh Vegetables Box, Charcoal 10kg Bag, Meat Pack 1kg, Seafood Mix 1kg
- Expense categories updated: Market/Groceries + Beverages/Drinks + Supplies marked as `isStock: true`

---

## Common change patterns

### Add a new stock unit
Add value to `StockUnit` enum in `schema.prisma`. Add to `UNIT_LABEL`/`UNIT_ABBR` maps in the relevant pages.

### Add delivery notification
Import `emitNotification` from `src/lib/notifications.ts` in `actions.ts`. Emit on `DISCREPANCY_FLAGGED` action to notify managers (similar to leave request notifications in HR module).

### Add delivery attachment (receipt photo)
Add `receiptUrl String?` to `StockDelivery`. Update cashier entry page with file upload. Follow the same pattern as `EmployeeDocument` uploads in the HR module.

### Change stock level computation
All stock calculations go through `computeStockLevel()` and `computeAllStockLevels()` in `src/lib/inventory.ts`. Change the query there — everything else reads from those helpers.
