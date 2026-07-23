# Inventory Module — Developer Reference

## Overview

The inventory module tracks stock purchases (deliveries from suppliers), reconciles physical counts against invoices using a **blind-count** system to catch pilferage or delivery errors, records stock consumption, and provides supplier spend reports. It integrates with the cashier expense system — every stock purchase auto-creates an `Expense` record.

**The stock invoice *is* the delivery.** A cashier enters a stock invoice at **Cashier → Expenses** (Stock Invoice mode): picking stock items, quantities and unit costs. Submitting creates the `StockDelivery` (status `OPEN`, awaiting physical count) *and* its linked `Expense` in one step. The physical count then happens against that invoice — counter staff see the invoice's items but not the quantities (blind). A matching count auto-completes the delivery and auto-confirms the expense; a mismatch is flagged to the manager. There is no separate "create delivery" step and no separate manual expense-confirmation step for new stock invoices — the blind count is the verification.

---

## Role access map

| Route | Roles |
|---|---|
| `/admin/stock-items` | ADMIN |
| `/admin/suppliers` | ADMIN |
| `/cashier/expenses` (stock invoice + pre-payment entry) | CASHIER, MANAGER, ADMIN |
| `/inventory` (all sub-routes) | CASHIER, WAITER, KITCHEN, MANAGER, ADMIN |
| `/inventory/deliveries/[id]/cashier` (legacy in-flight only) | CASHIER, MANAGER, ADMIN |
| `/inventory/deliveries/[id]/counter` | WAITER, KITCHEN, MANAGER, ADMIN |
| Settle pre-payment (`settlePrepaidDelivery`) | ADMIN only |
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
Actions: `CREATED`, `PREPAID`, `CASHIER_SUBMITTED`, `COUNTER_SUBMITTED`, `DISCREPANCY_FLAGGED`, `AUTO_COMPLETED`, `MANAGER_RESOLVED`, `MANAGER_APPROVED`, `MARKED_PARTIAL`, `PREPAY_MISMATCH`, `PREPAY_SETTLED`

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

New flow — the stock invoice creates the delivery:

```
Cashier enters stock invoice (Cashier → Expenses)
  → StockDelivery created directly as OPEN (cashier side already submitted) + Expense created
  → counter enters blind physical count
        ├─ all match → COMPLETE (StockMovement DELIVERY_IN created, linked Expense auto-confirmed)
        └─ mismatch → PENDING_REVIEW → manager resolves → COMPLETE or PARTIAL (Expense confirmed on resolve)

Pre-payment (Cashier → Expenses, Pre-payment mode)
  → StockDelivery created as PREPAID + Expense created immediately
  → when the invoice arrives, cashier enters a stock invoice TAGGED to this delivery
        → fills the delivery items, status → OPEN (no second Expense — already paid)
        → counter counts → COMPLETE (paymentStatus stays PREPAID)
        → ADMIN settles (settlePrepaidDelivery) → paymentStatus PAID
```

`DRAFT` is legacy: only pre-existing deliveries created before this flow can be in `DRAFT`/`OPEN`-without-invoice. The legacy `/inventory/deliveries/[id]/cashier` entry page still serves those.

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

Invoice entry lives in `src/app/(app)/cashier/actions.ts`; count + resolution + settlement live in `src/app/(app)/inventory/deliveries/[id]/actions.ts`. The comparison/confirmation helpers are shared in `src/lib/deliveries.ts`.

### `addStockInvoice(formData)` — `src/app/(app)/cashier/actions.ts`
CASHIER/MANAGER/ADMIN. The core action: a stock invoice becomes the delivery.
- **New invoice** (no tag): in one transaction, creates the `Expense` (invoiceType `STOCK`, with `ExpenseLine` children and `shiftId` so it hits drawer reconciliation) and the `StockDelivery` (status `OPEN`, `cashierSubmittedAt` set, items carrying `cashierQty` + `unitCost`). Logs `CREATED` + `CASHIER_SUBMITTED`.
- **Tagged to a PREPAID delivery**: fills that delivery's items and flips it to `OPEN`; creates **no** new expense (already paid). Records `PREPAY_MISMATCH` if the invoice total differs from the prepaid amount.
- **Tagged to a PARTIAL delivery**: creates a child delivery (`parentDeliveryId`), its own expense unless the parent was prepaid.

### `recordStockPrepayment(formData)` — `src/app/(app)/cashier/actions.ts`
CASHIER/MANAGER/ADMIN. Records a payment before goods arrive: creates `Expense` (invoiceType `STOCK`, with `shiftId`) + `StockDelivery` (`status = PREPAID`, `paymentStatus = PREPAID`, `prepaidAt`). Logs `CREATED` + `PREPAID`.

### `submitCounterSide(formData)` — deliveries actions
WAITER/KITCHEN/MANAGER/ADMIN. Blind physical count.
- Rejected if the invoice has not been entered yet (`cashierSubmittedAt` null) — invoice-first, always.
- Upserts `StockDeliveryItem` rows with `counterQty` (cannot see cashier's qty), then calls `runComparison()`.

### `runComparison(deliveryId, actorId)` — `src/lib/deliveries.ts`
- All `cashierQty === counterQty` → auto-COMPLETE, creates `StockMovement` DELIVERY_IN per item, logs `AUTO_COMPLETED`, and calls `confirmLinkedExpense()`.
- Any mismatch → PENDING_REVIEW, logs `DISCREPANCY_FLAGGED`.

### `confirmLinkedExpense(deliveryId, actorId)` — `src/lib/deliveries.ts`
Sets `confirmedAt`/`confirmedById` on the delivery's linked `Expense` if still unconfirmed. Called on auto-complete, `resolveDelivery`, and `approveStockIn` — the blind count replaces manual manager confirmation.

### `resolveDelivery(formData)` — deliveries actions
MANAGER/ADMIN only. Sets `final_${itemId}` per item, creates `StockMovement` records, calls `confirmLinkedExpense()`, logs `MANAGER_RESOLVED` or `MARKED_PARTIAL`.

### `settlePrepaidDelivery(formData)` — deliveries actions
**ADMIN only.** For a `PREPAID` delivery, optionally adjusts the linked `Expense.amount` to the final invoice total (mandatory note), sets `paymentStatus = PAID`, logs `PREPAY_SETTLED`.

### Legacy actions (retained, drain-only)
`submitCashierSide` / `submitNonStockCashierSide` and the `/inventory/deliveries/[id]/cashier` page still serve deliveries created before this flow. `approveStockIn` (manager) still approves legacy simplified stock-ins. `submitCashierSide`'s `Expense.create` now also resolves `shiftId` via `getOpenShift`/`getAnyOpenShift` (same pattern as `addStockInvoice`) — it previously omitted this, so a CASH_DRAWER expense entered through this legacy path silently got `shiftId: null` and never hit that shift's reconciliation.

---

## Pre-payment flow

1. Cashier → Expenses → **Pre-payment** mode: enter supplier + category + amount + payment method → `recordStockPrepayment()` creates the expense and a `PREPAID` delivery.
2. Goods stay at vendor — delivery is visible in Manager Inventory as "Pre-paid awaiting delivery".
3. When the invoice/goods arrive: cashier enters a **Stock Invoice** and picks this delivery in the "Tag to outstanding delivery" dropdown. Submitting fills the items and flips it to `OPEN`; no second payment is recorded.
4. Counter enters the blind count → normal comparison → COMPLETE (`paymentStatus` stays `PREPAID`).
5. **Admin** opens the delivery and settles it (`settlePrepaidDelivery`): confirms the final amount → `paymentStatus = PAID`.

---

## Partial delivery flow

1. Delivery reaches `PENDING_REVIEW` after the count.
2. Manager ticks "Partial delivery — more items expected" in the resolution form.
3. `resolveDelivery()` sets `status = PARTIAL`, creates movements for `finalQty` received so far.
4. The next batch is entered as a **Stock Invoice** tagged to the partial delivery (dropdown at Cashier → Expenses); the child delivery gets `parentDeliveryId` set and runs its own count.
5. Each batch's `finalQty` is added to stock when it completes.

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

src/lib/deliveries.ts             # runComparison(), confirmLinkedExpense() — shared
src/app/(app)/cashier/
  actions.ts                      # addStockInvoice (invoice = delivery), recordStockPrepayment,
                                  # addExpense (NON_STOCK only), saveReceipts helper
  expenses/
    page.tsx                      # stock invoice + pre-payment entry (suppliers, tag list)
    ExpenseForm.tsx               # NON_STOCK / STOCK / PREPAYMENT modes

src/app/(app)/inventory/
  layout.tsx                      # tab nav: Stock Levels | Deliveries | Usage | Reports
  page.tsx                        # dashboard: low-stock alerts, stock table, pre-paid count
  deliveries/
    page.tsx                      # delivery list (no create button; invoices come from cashier)
    [id]/
      page.tsx                    # detail: cashier panel + counter panel + admin settle + audit log
      cashier/page.tsx            # LEGACY invoice entry (in-flight deliveries only)
      counter/page.tsx            # blind count form (waits for invoice if not entered)
      actions.ts                  # submitCounterSide, resolveDelivery, settlePrepaidDelivery (ADMIN),
                                  # submitCashierSide/submitNonStockCashierSide (legacy)
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

1. **Expense at payment time**: `Expense` is created when `recordStockPrepayment` or `addStockInvoice` runs — not when goods are received or counted. The stock-invoice `Expense` carries `shiftId`, so a cash-drawer stock purchase reduces `expectedCash` in shift reconciliation exactly like any other cashier expense.
2. **StockMovement only on COMPLETE or PARTIAL resolution** — never on OPEN or PENDING_REVIEW. This prevents phantom stock from unresolved discrepancies.
3. **Counter cannot see cashier quantities** — the counter page fetches only `stockItem.name` and `stockItem.unit`, never `cashierQty`.
4. **The invoice defines the items** — invoice-first, always. The physical count is always against the entered invoice's items; there is no count-first path. If the invoice has not been entered, the counter page shows a "waiting for invoice" notice.
5. **Blind count replaces manual confirmation** — a completed delivery auto-confirms its linked `Expense` (`confirmLinkedExpense`). The manager's "Legacy Stock Expenses — Awaiting Confirmation" list only shows old stock invoices that have no delivery.
6. **Pre-payment settlement is ADMIN-only** — `settlePrepaidDelivery` is the only path from `paymentStatus = PREPAID` to `PAID`; a tagged invoice never creates a second payment.
7. **Partial batch link** — when a delivery is marked PARTIAL, `StockMovement` is created for `finalQty` (what was received in this batch). The next batch is a stock invoice tagged to the partial delivery.
8. **`optimalStock` is informational only** — it does not trigger automatic orders. It shows on the dashboard as "order X to reach optimal".

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
