# POS Module — Developer Reference

This document is the definitive reference for the Point of Sale module of **QQ Hotpot BBQ**. Read it before making changes and update accordingly to avoid breaking locked business rules.

---

## Table of Contents

1. [Module overview](#1-module-overview)
2. [Role access map](#2-role-access-map)
3. [User journeys](#3-user-journeys)
4. [File map](#4-file-map)
5. [Data model](#5-data-model)
6. [Business rules](#6-business-rules)
7. [Realtime events](#7-realtime-events)
8. [Settings reference](#8-settings-reference)
9. [Common change patterns](#9-common-change-patterns)

---

## 1. Module overview

The POS module covers the complete dine-in flow for a **buffet hotpot
restaurant** (currency: **MMK**, whole numbers only):

```
Guest arrives → Waiter opens table → Waiter adds pots/beer/wastage/menu items
    → Kitchen sees pots, marks Delivered
    → Cashier computes bill, takes split payment, settles table
    → Cashier closes shift, reconciles cash drawer
```

Alongside the core flow: **table reservations**, **shift-based cash
reconciliation**, **expenses**, and a **Manager/Admin** oversight layer
(reports, configuration).

---

## 2. Role access map

| Role | Module | Landing after login |
|---|---|---|
| `WAITER` | `/waiter` | `/waiter` |
| `KITCHEN` | `/kitchen` | `/kitchen` |
| `CASHIER` | `/cashier` | `/cashier` |
| `MANAGER` | `/waiter` `/kitchen` `/cashier` `/reports` `/manager` | `/reports` |
| `ADMIN` | everything + `/admin` | `/admin` |
| `HR` | `/hr` `/my-account` | `/hr` |
| `MARKETING` | `/my-account` | `/my-account` |

Users can hold **multiple roles** simultaneously. Navigation auto-hides
modules the user cannot access — but server-side `requireAnyRole()` in
each layout is the actual enforcement.

Source: [`src/lib/rbac.ts`](../src/lib/rbac.ts)

---

## 3. User journeys

### 3.1 Waiter (tablet)

1. Open `/waiter` — sees live table grid (colour-coded: Available / Occupied /
   Reserved / Inactive). Tables occupied ≥ **105 minutes** show an orange
   **OVERDUE** badge on the table card.
2. Tap an available table → `/waiter/open/[tableId]` → enter **Adults** and
   **Children** counts → **Open Table** creates a `TableSession` (OPEN).
3. Session page `/waiter/session/[id]`:
   - **Add Pot** — pick kind (BBQ or Hotpot), pick soup flavours (BBQ = 1,
     Hotpot = 2), submit. Each pot is auto-marked free/paid at creation time
     using the free-pot formula (see §6.1). Sends `kitchen:pot:new` event.
   - **Set Beer** — quantity of beer bottles for the table.
   - **Set Wastage** — grams of food wasted (also editable by cashier).
   - **Menu items** — +/− qty steppers for all active orderable menu items
     (items with codes NOT in `SYSTEM_CODES`). Each quantity change calls
     `setItemQty(sessionId, itemCode, qty)` which upserts an `OrderItem` row.
     These items appear on the bill as extra line items.
   - **Update Headcount** — changing adults/children recalculates which pots
     are free/paid on the bill (note: `isFree` flag on historical pots is NOT
     retroactively changed; only the computed bill view changes).
   - **Void Pot** — removes a pending pot (sends `kitchen:pot:void`).
   - **Move Table** (`changeTable`) — moves the session to a different table.
     The destination dropdown only ever lists currently-unoccupied tables
     (built server-side from open sessions + merges), and `changeTable` itself
     also guards against writing onto an already-occupied table, so this
     can't create two OPEN sessions on the same table either through the UI
     or a direct call to the action.
   - **Cancel Session** — blocked if the session has ever had a payment (live
     or voided — see §6.5). Voids all pot orders, unlinks table merges, sets
     status to `CANCELLED`.

### 3.2 Kitchen (PC display)

1. Open `/kitchen` — sees all PENDING pot tickets across all open sessions,
   grouped by table.
2. Sound control — a **Mute / Unmute** toggle in the top bar. Sound must be
   enabled once per browser session (autoplay policy). When unmuted, a
   **15-second beep** fires automatically while any pot has PENDING status.
3. Click **Delivered** on a ticket — marks `PotOrder.status = DELIVERED`,
   emits `kitchen:pot:delivered`. Ticket moves to history.
4. The screen auto-refreshes via Socket.IO events **and** a 5-second polling
   fallback.

### 3.3 Cashier (PC)

**Checkout flow:**
1. `/cashier` — sees open sessions list (table label, diners, time open). Nav
   cards: Tables, Expenses, History, Shift / Close Shift, To Collect.
2. Click a session → `/cashier/checkout/[sessionId]`:
   - View full bill breakdown (headcount, beer, paid pots, wastage, extra menu
     items, discount, service, tax, total already paid, balance due).
   - **Set Discount** — % or fixed, with a mandatory reason. No approval needed.
   - **Edit Wastage** — cashier can also enter/correct wastage grams.
   - **Add Payment** — Cash, KBZPay, or Other; partial amounts allowed (split
     payments). Only CASH payments link to the open shift. When CASH amount
     entered exceeds the remaining balance a **Change Due** banner appears live.
   - **Settle** — button enabled only when `balance ≤ 0`. Closes the session
     (CLOSED), stores `billTotal = bill.total` on the session, frees the table,
     redirects to settled view for receipt print.
   - **Print Receipt** — calls `window.print()`, CSS `@media print` shows only
     `.receipt` block (thermal-friendly).

**History:**
- `/cashier/history` — date picker (defaults to today). Shows all CLOSED
  sessions for the selected date with per-session breakdown: table, open/close
  time, pax, cash / KBZPay / other amounts, total. Daily totals footer row.
  Mobile card layout + desktop table layout. Each row links to the receipt view.

**Tables / Reservations:**
- `/cashier/tables` — live floor map + reservation list. Tables occupied
  ≥ **105 minutes** show an orange **OVERDUE** badge.
- Create reservation: customer name, phone, party size, date/time, optional
  table. Table is **blocked** from `bookingAt − blockMins` to `bookingAt + durationMin`.
- Actions: **Seat** (opens a session), **Cancel**, **No-show**.

**Expenses:**
- `/cashier/expenses` — log an expense: category, amount, payment source
  (CASH_DRAWER or BANK_TRANSFER), description, optional vendor.
- CASH_DRAWER expenses attach to the open shift and reduce expected cash.
- BANK_TRANSFER expenses are recorded for reporting only; no effect on drawer.

**Shift:**
- `/cashier/shift` — one cashier can have one OPEN shift at a time.
- If another cashier's shift is OPEN, both `/cashier` and `/cashier/shift` show
  a **handover banner** (who has the shift, since when, instructions to close it).
  A new shift cannot be opened until the prior one is closed.
- **Open Shift**: opening float is auto-computed from `getCashStanding()` (last
  shift's counted cash + injections − collections since then).
- **Close Shift**: counts actual cash in drawer → system computes
  `expected = openingFloat + cashSales_net − cash_drawer_expenses` → shows `variance`.

### 3.4 Manager

Has access to Waiter + Kitchen + Cashier + Reports + Manager dashboard.
Can view all shifts and daily reports. Can view live attendance and add/delete
**fines** for employees directly from the Teams tab on the manager dashboard.
Has an optional **PIN** (`User.pinHash`) for future manager approval flows.

### 3.5 Admin

Full access including `/admin`:
- **Tables** — create/toggle Areas and Tables (▲/▼ buttons reorder areas).
- **Menu & Settings** — price editing (save button only appears when a row is
  dirty); items grouped by category. Also: free-pot ratio, rounding,
  reservation block minutes, tax/service toggles + rates, currency, restaurant name.
- **Flavours** — add/edit/delete/hide soup flavours; set `appliesTo`
  (HOTPOT/BBQ/BOTH). Two preview buckets (Hotpot | BBQ) show which flavours
  are in each category. Unified list with ▲/▼/Edit/Hide/Delete. **Delete is
  blocked (returns an error, no destructive action taken) if the flavour has
  ever been used in a `PotOrder`** — deleting a used flavour would silently
  erase it from every historical order that used it (no cascade snapshot
  exists). Use **Hide** (`toggleFlavour` → `isActive: false`) to remove a
  flavour from active use instead; Delete only succeeds for a flavour with
  zero usage.
- **Categories** — add/toggle expense categories; mark categories as "stock" type.
- **Stock Items / Suppliers** — manage inventory items and vendors (ADMIN only).

User account management is done via **HR → Employees**, not Admin.

---

## 4. File map

### Core library (`src/lib/`)

| File | Purpose |
|---|---|
| [`auth.ts`](../src/lib/auth.ts) | JWT sessions (12h), cookie `qq_session`, `requireSession()`, `requireAnyRole()`, `hashPassword`, `verifyPassword`, `hashPin`. **`requireSession()` re-verifies `isActive`/`roles` against the DB on every call** (not just the JWT claims) — a deactivated user or a role change takes effect on the user's very next request, not after the 12h cookie expires. |
| [`rbac.ts`](../src/lib/rbac.ts) | Role enum, `MODULES` array, `modulesFor()`, `landingFor()`, `ROUTE_ROLES` |
| [`db.ts`](../src/lib/db.ts) | Singleton `PrismaClient` via `globalThis.__qq_prisma` |
| [`realtime.ts`](../src/lib/realtime.ts) | `emitKitchen()`, `emitFloor()`, `emitHR()`, `setIO()` — Socket.IO bridge |
| [`pricing.ts`](../src/lib/pricing.ts) | `freePotsAllowed()`, `paidPotCount()`, `computeBill(input)` — pure, no DB. `BillInput` now accepts `extraItems?: ExtraItem[]` for non-system orderable items |
| [`orders.ts`](../src/lib/orders.ts) | `getSessionDetail()` — loads session + all menu items, extracts non-system `OrderItem` rows as `extraItems`, computes full bill |
| [`shift.ts`](../src/lib/shift.ts) | `getOpenShift()`, `getAnyOpenShift()` (any cashier's open shift, used for handover), `computeShiftTotals(shiftId, openingFloat, shiftWindow?)` — pass `shiftWindow` to enable change deduction, `getCashStanding()` |
| [`settings.ts`](../src/lib/settings.ts) | `getSettings()` — reads `Setting` rows from DB |
| [`menu.ts`](../src/lib/menu.ts) | `getMenuPrices()` — reads `MenuItem` prices from DB |
| [`floor.ts`](../src/lib/floor.ts) | Floor / table availability helpers |
| [`format.ts`](../src/lib/format.ts) | `formatMMK()`, `formatDate()`, `parseInputDate()` (DD-MMM-YYYY), date/time formatters |
| [`action-result.ts`](../src/lib/action-result.ts) | Shared `ActionResult` type (`{ ok: true } \| { ok: false; error: string }`) |
| [`socket-client.ts`](../src/lib/socket-client.ts) | `useRoomRefresh()` hook — joins a Socket.IO room, triggers `router.refresh()` on events |

### Server actions (per module)

| File | Key actions |
|---|---|
| [`(app)/waiter/actions.ts`](../src/app/(app)/waiter/actions.ts) | `openTable`, `addPot`, `setBeerQty`, `setItemQty`, `setWastage`, `updateHeadcount`, `voidPot`, `cancelSession` |
| [`(app)/kitchen/actions.ts`](../src/app/(app)/kitchen/actions.ts) | `deliverPot` |
| [`(app)/cashier/actions.ts`](../src/app/(app)/cashier/actions.ts) | `addPayment`, `applyDiscount`, `removeDiscount`, `voidPayment`, `settleSession` (stores `billTotal` at close), `openShift`, `closeShift`, `addExpense`, `createReservation`, `seatReservation`, `cancelReservation`, `noShowReservation` |
| [`(app)/admin/actions.ts`](../src/app/(app)/admin/actions.ts) | `createArea`, `moveArea`, `toggleArea`, `createTable`, `toggleTable`, `updateMenuItem`, `updateSettings`, `createFlavour`, `updateFlavour`, `deleteFlavour`, `toggleFlavour`, `createCategory`, `toggleCategory`, `toggleCategoryStock` |
| [`(auth)/login/actions.ts`](../src/app/(auth)/login/actions.ts) | `loginAction` |

### Pages & components

| Path | What it renders |
|---|---|
| `/waiter` | Table grid (live status, OVERDUE badge ≥ 105 min) |
| `/waiter/open/[tableId]` | Headcount form to open a session |
| `/waiter/session/[id]` | Active session: pots, beer, wastage, menu item qty controls |
| `/kitchen` | Pending pot tickets + mute/unmute toggle; `KitchenLive.tsx` is the client component |
| `/cashier` | Open sessions list + nav cards (Tables, Expenses, History, Shift, To Collect) |
| `/cashier/checkout/[sessionId]` | Full bill (inc. extra menu items), discount, payment (live Change Due for CASH), settle, print |
| `/cashier/tables` | Floor map + reservations (OVERDUE badge) |
| `/cashier/expenses` | Expense form + today's list |
| `/cashier/shift` | Open/close shift, totals, handover banner |
| `/cashier/history` | Date-filtered closed session history with payment breakdown |
| `/reports` | Daily sales summary |
| `/admin` | Admin sub-nav |
| `/admin/tables` | Area + table CRUD with ▲/▼ reordering |
| `/admin/menu` | Price editing (dirty-row save button, grouped by category) |
| `/admin/flavours` | Soup flavour management (edit/delete inline, bucket preview) |
| `/admin/categories` | Expense category management + isStock toggle |
| `/admin/stock-items` | Stock item CRUD |
| `/admin/suppliers` | Supplier CRUD |

### Shared components

| Component | Purpose |
|---|---|
| `AppShell.tsx` | Auth'd layout wrapper + nav, loads notifications |
| `NavBar.tsx` | Role-filtered top navigation |
| `BillSummary.tsx` | Reusable bill breakdown display |
| `LiveRefresh.tsx` | Socket.IO + polling combo refresh |
| `AutoRefresh.tsx` | Periodic `router.refresh()` |
| `SubmitButton.tsx` | Disables during `useFormStatus` pending |

### Infrastructure

| File | Purpose |
|---|---|
| [`server.ts`](../server.ts) | Custom Next.js + Socket.IO server (entry point for `npm start`) |
| [`middleware.ts`](../middleware.ts) | Edge middleware: JWT check → `/login` redirect |
| [`Dockerfile`](../Dockerfile) | Multi-stage build (deps → build → runtime) |
| [`docker-compose.yml`](../docker-compose.yml) | `app` + `db` (postgres:16). Traefik labels route `app.qqhotpotbbq.com` → port 3000 via external `traefik-public` network |
| [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) | CI/CD: typecheck → build image → push GHCR → SSH deploy |
| [`scripts/bootstrap-vps.sh`](../scripts/bootstrap-vps.sh) | One-shot VPS setup (Docker, `.env`, seed) |

---

## 5. Data model

Key relationships (see full schema at [`prisma/schema.prisma`](../prisma/schema.prisma)):

```
User
├── TableSession (openedBy / closedBy)
├── PotOrder (createdBy / deliveredBy)
├── OrderItem (line items: BEER, other menu items)
├── Payment (receivedBy)
├── Expense (enteredBy)
├── CashierShift
└── Reservation (createdBy)

Area
└── Table
    ├── TableSession
    └── Reservation

TableSession
├── billTotal Int?  — computed bill.total stored at settlement; used to deduct
│                     change given from cashSales in shift reconciliation
├── PotOrder
│   └── PotOrderFlavour → SoupFlavour
├── OrderItem  (itemCode, qty, unitPrice — includes BEER and any extra menu items)
└── Payment → CashierShift
    └── voidedAt/voidedById — soft-void (see 6.5); voided payments are never
        hard-deleted, and every functional total (balance, revenue,
        reconciliation) must explicitly filter `voidedAt: null`

CashierShift
├── Payment (CASH only, voidedAt: null → affects reconciliation)
└── Expense (CASH_DRAWER only, rejectedAt: null → affects reconciliation)
```

### SYSTEM_CODES

Codes treated specially by `computeBill()`; never shown as orderable items in the waiter UI:
`["ADULT", "CHILD", "BEER", "POT_ADDON", "WASTAGE"]`

Any `OrderItem` whose code is NOT in SYSTEM_CODES is an **extra item** (a regular menu item). These are exposed as `extraItems` in `BillInput` and shown as a separate section in the waiter session controls.

### Key enums

| Enum | Values |
|---|---|
| `Role` | WAITER / KITCHEN / CASHIER / MANAGER / ADMIN / HR / MARKETING |
| `MenuItemCode` | ADULT / CHILD / BEER / POT_ADDON / WASTAGE (plus any custom items — `String` field, not a DB enum) |
| `PotKind` | HOTPOT / BBQ |
| `PotStatus` | PENDING / DELIVERED |
| `SessionStatus` | OPEN / CLOSED / CANCELLED |
| `DiscountType` | PERCENT / FIXED |
| `PaymentMethod` | CASH / KBZPAY / OTHER |
| `ReservationStatus` | BOOKED / SEATED / CANCELLED / NO_SHOW |
| `ExpenseSource` | CASH_DRAWER / BANK_TRANSFER |
| `ShiftStatus` | OPEN / CLOSED |
| `SoupApplies` | HOTPOT / BBQ / BOTH |

---

## 6. Business rules

### 6.1 Free pot allocation

```ts
// src/lib/pricing.ts
freePotsAllowed(diners, ratio, rounding)
  = rounding === "DOWN"
    ? Math.max(1, Math.floor(diners / ratio))
    : Math.ceil(diners / ratio)          // ← default: UP
```

- **Default ratio = 4** (configurable via `Setting.freePotRatio`).
- **Default rounding = UP** (configurable via `Setting.freePotRounding`).
- Examples: 1–4 diners → 1 free pot; 5 diners → 2 free pots; 8 diners → 2 free pots.
- `isFree` is stamped on each `PotOrder` **at creation time** (in `addPot` action)
  and is never rewritten afterward — it's a snapshot, not a live value.
  Both the settlement bill (`getSessionDetail`/`computeBill`) and the kitchen
  ticket's free/"(add-on)" label recompute free-vs-paid dynamically from
  *current* headcount and pot order each time they render, so a headcount
  change after pots exist is reflected everywhere it's displayed — only the
  raw stored `isFree` column itself goes stale, and nothing reads it directly.

### 6.2 Soup flavour rules

| Kind | Flavours required |
|---|---|
| BBQ | Exactly **1** (must have `appliesTo = BBQ or BOTH`) |
| HOTPOT | Exactly **2** (must have `appliesTo = HOTPOT or BOTH`) |

Enforced in `addPot` server action. Either counts as **1 pot order**.

### 6.3 Bill computation

```
subtotal = adults × priceAdult
         + children × priceChild
         + paidPots × pricePotAddon      (free pots not charged)
         + beerQty × priceBeer
         + wastageGrams × priceWastage   (MMK per gram)
         + Σ(extraItems[i].qty × extraItems[i].unitPrice)  ← orderable menu items

afterDiscount = subtotal − discount
  where discount = subtotal × pct/100    (PERCENT)
               or  min(subtotal, fixedAmt) (FIXED)

serviceCharge = afterDiscount × serviceRate/100   (if serviceEnabled)
tax           = (afterDiscount + serviceCharge) × taxRate/100  (if taxEnabled)

total = afterDiscount + serviceCharge + tax
```

Source: [`src/lib/pricing.ts`](../src/lib/pricing.ts) — `computeBill()`.

All amounts are **whole MMK** (Math.round applied to percent calculations).

### 6.4 Split payments

- Multiple `Payment` rows per `TableSession` are allowed.
- `balance = bill.total − Σ(payments.amount)`.
- **Settle** is only enabled when `balance ≤ 0`.
- Only `CASH` payments are linked to `CashierShift` and affect cash
  reconciliation. `KBZPAY` and `OTHER` are recorded but excluded from the drawer.
- When a CASH payment amount exceeds the remaining balance (customer overpays),
  a **Change Due** banner is shown live in the checkout UI. The change amount is
  deducted from `cashSales_net` in shift reconciliation via the `billTotal` field.
- `balance`/`paid` (`getSessionDetail` in `lib/orders.ts`) only ever sums
  **live** payments (`voidedAt: null`) — a voided payment's amount is excluded
  so the guest can be re-charged the correct amount after a void.

### 6.5 Payment void — soft-void only, still blocked after settlement

**Voiding never hard-deletes a `Payment` row, and it's still impossible after a session is settled — both by design, for fraud prevention and audit trail.**

`voidPayment` (`cashier/actions.ts`) sets `voidedAt`/`voidedById` on the row instead of deleting it — this preserves an audit trail (who voided it, when) that a hard delete would have destroyed entirely. It still hard-checks `session.status === "OPEN"`, so once a session is settled/closed there is no route or button to void or reverse a payment, same as before.

**Why this matters beyond the audit trail:** `cancelSession` (`waiter/actions.ts`) blocks cancelling an OPEN session if it has ever had a payment (`s.payments.length > 0`, an unfiltered live query — voided rows still count). Before the soft-void fix, hard-deleting a voided payment made that check see zero payments, so a session that had real financial activity (cash taken, then voided) could be cleanly cancelled — pot orders voided, table merges deleted, no trace money was ever handled. Because voided payments are no longer deleted, `cancelSession`'s existing check now correctly still blocks cancellation in that case, with no change needed to `cancelSession` itself.

If a payment error occurs after settlement, the correction must be logged as a cash adjustment by a manager — not a payment void/deletion.

### 6.6 Shift reconciliation

```
openingFloat  = lastShift.expectedCash + injections − collections
                  − (CASH_DRAWER expenses entered since with no shift open)
                  (getCashStanding() — never lastShift.countedCash; a manual
                   count must only ever flag a discrepancy, never silently
                   become the baseline every subsequent day carries forward)

netCashChange = for each settled session: non-cash tenders (KBZPAY/OTHER) are
                  credited against billTotal first; only cash actually in
                  excess of what's still owed counts as change
                  (see `netCashChange()` in `src/lib/pricing.ts`)

cashSales_net = Σ(live CASH payments in shift, voidedAt: null) − Σ netCashChange

expected      = openingFloat + cashSales_net − Σ(CASH_DRAWER expenses in shift)
variance      = countedCash − expected
```

Source: [`src/lib/shift.ts`](../src/lib/shift.ts) — `computeShiftTotals(shiftId, openingFloat, shiftWindow?)`, [`src/lib/pricing.ts`](../src/lib/pricing.ts) — `netCashChange(payments, billTotal)`.

- Pass `shiftWindow: { openedAt, closedAt }` to enable change deduction (all
  current callers do so). Without it, falls back to gross CASH sum (old behaviour).
- `billTotal` is stored on `TableSession` at `settleSession` time; sessions
  settled before this field was added have `billTotal = null` and are excluded
  from change deduction (no double-count risk).
- **`netCashChange` is the one shared helper for this formula** — it's used
  identically in shift reconciliation, `/accounting` P&L, `/reports`,
  `/cash-collection`, and cashier history/day-summary. Earlier versions of
  each of these computed change as `Σ(all payment methods) − billTotal` and
  subtracted the whole thing from cash — which let a KBZPay/Other overpayment
  wrongly eat into the cash figure. Never reimplement this inline; import the
  helper.
- `countedCash` (the physical count at shift close) is stored for variance
  comparison **only** — it never feeds back into `getCashStanding()`/the next
  shift's `openingFloat`. Only the calculated `expectedCash` does.
- One cashier → one OPEN shift at a time. Multiple shifts per day are allowed.
- BANK_TRANSFER expenses are **excluded** from reconciliation.
- Handover enforced: `openShift` redirects to error if any other cashier's shift
  is still open (`getAnyOpenShift()` check).

### 6.7 Table reservation blocking

A table is considered **reserved/unavailable** during the window:
```
[bookingAt − blockMins, bookingAt + durationMin]
```

- `blockMins` default = **90** (configurable via `Setting.reservationBlockMins`).
- `durationMin` default = **120** (stored per reservation).
- Status `SEATED` or `CANCELLED` lifts the block.

### 6.8 Discounts

- Applied by **cashier freely** — no manager approval required.
- Type: `PERCENT` (0–100%) or `FIXED` (capped at subtotal).
- `discountReason` field is required (enforced in UI, schema allows null for
  programmatic use).
- Discount is stored on `TableSession`, not on individual items.

### 6.9 Wastage

- Entered in **grams** by either waiter (`setWastage` in waiter actions) or
  cashier (`setWastage` in cashier actions) — last write wins.
- Billed at `priceWastage MMK/gram` (MenuItem code = WASTAGE).

### 6.10 Tax and service charge

Both are **off by default**. Configured via admin settings:
- `taxEnabled` (bool) + `taxRatePct` (number)
- `serviceEnabled` (bool) + `serviceRatePct` (number)

Service is applied to `afterDiscount`; tax is applied to
`afterDiscount + serviceCharge`.

### 6.11 Table overdue

A table session is considered **overdue** when it has been open for ≥ **105 minutes**. This is displayed as an orange "OVERDUE" badge on:
- The waiter table grid (`/waiter`)
- The cashier tables floor view (`/cashier/tables`)

No server-side enforcement — purely a display warning to prompt checkout.

---

## 7. Realtime events

Socket.IO server runs alongside Next.js on the same port via a custom
`server.ts`. Clients join rooms on mount; the server stores the `io` instance
in `globalThis.__qq_io` via `setIO()`.

### Rooms

| Room | Who joins |
|---|---|
| `kitchen` | Kitchen page |
| `floor` | Waiter table grid, cashier pages |
| `hr` | Manager live attendance dashboard, notification bell |

### Events emitted by server actions

| Event | Room | Trigger | Payload |
|---|---|---|---|
| `pot:new` | `kitchen` | `addPot` | `{ sessionId }` |
| `pot:void` | `kitchen` | `voidPot` | `{ sessionId, potId }` |
| `pot:delivered` | `kitchen` | `deliverPot` | `{ potId }` |
| `table:update` | `floor` | `openTable`, `settleSession`, `cancelSession`, `seatReservation`, `addPot` | `{ tableId }` |
| `attendance:update` | `hr` | Clock in/out | employee data |
| `break:out` / `break:in` | `hr` | Break start/end | employee data + notification |
| `notification:new` | `hr` | Any `createNotification()` | notification object |

All emits are **best-effort** (try/catch, no error thrown). If the socket is
unavailable, clients poll via `AutoRefresh` (5-second interval on kitchen,
`router.refresh()` driven).

### Kitchen beep / mute

- Implemented in `KitchenLive.tsx` using **Web Audio API** (`AudioContext`,
  880 Hz sine, 0.4 s).
- Fires every **15 seconds** while `pendingCount > 0`.
- A **Mute / Unmute** toggle persists the preference in component state.
  The first unmute also unlocks the `AudioContext` (browser autoplay policy).

---

## 8. Settings reference

All stored as `Setting` rows with `key` / `valueJson`. Read via
`getSettings()` in [`src/lib/settings.ts`](../src/lib/settings.ts).

| Key | Type | Default | Description |
|---|---|---|---|
| `freePotRatio` | number | `4` | Diners per free pot |
| `freePotRounding` | `"UP"` \| `"DOWN"` | `"UP"` | How to round pot allowance |
| `reservationBlockMins` | number | `90` | Minutes before booking when table blocks |
| `taxEnabled` | boolean | `false` | Whether to charge commercial tax |
| `taxRatePct` | number | `0` | Tax rate % |
| `serviceEnabled` | boolean | `false` | Whether to charge service fee |
| `serviceRatePct` | number | `0` | Service rate % |
| `currency` | string | `"MMK"` | Display currency label |
| `restaurantName` | string | `"QQ Hotpot BBQ"` | Shown on login + receipts |

Changed via Admin → Menu & Settings (server action `updateSettings`).

---

## 9. Common change patterns

### Add a new orderable menu item

1. Add a `MenuItem` row in the DB (or via seed) with a unique `code` that is NOT in `SYSTEM_CODES`.
2. The item automatically appears in the waiter session "Menu items" section with qty steppers.
3. It is picked up as an `extraItem` by `getSessionDetail()` and added to the bill via `computeBill()`.
4. No code changes needed unless you want special billing logic.

### Add a new system-level item (like BEER)

1. Add code to `SYSTEM_CODES` constant in `src/lib/pricing.ts` and `src/app/(app)/waiter/session/[id]/page.tsx`.
2. Add dedicated UI controls in `SessionControls.tsx`.
3. Add a server action in `waiter/actions.ts`.
4. Add an `add()` line in `computeBill()` in `pricing.ts`.

### Change the free-pot formula

Edit `freePotsAllowed()` in [`src/lib/pricing.ts`](../src/lib/pricing.ts).
The `ratio` and `rounding` args come from `getSettings()`. To change defaults,
update the seed values for `freePotRatio` and `freePotRounding` in
[`prisma/seed.ts`](../prisma/seed.ts).

### Add a new payment method

1. Add the value to `PaymentMethod` enum in the schema.
2. Run `prisma db push` on the VPS.
3. Update the cashier checkout UI to offer the new method.
4. Decide whether it affects shift reconciliation (update `computeShiftTotals` if so).

### Touching anything that reads `Payment` rows

`Payment` is soft-voided (`voidedAt`/`voidedById`, §6.5), not hard-deleted. Any new query that reads `Payment` rows for a **functional total** (balance owed, revenue, cash/shift reconciliation) must filter `voidedAt: null` explicitly — a voided row still exists and will silently double-count or distort a total otherwise. Current call sites that already do this correctly: `getSessionDetail` (`lib/orders.ts`), `computeShiftTotals` (`lib/shift.ts`), `/accounting`, `/reports`, `/cash-collection`, `/cashier` (page + history). If you add a new payment total anywhere, add it to this list and to the filter.

Also reuse `netCashChange(payments, billTotal)` (`src/lib/pricing.ts`) for computing how much of a session's cash is "change" — never reimplement `Σ(all methods) − billTotal` inline (see §6.6 for why that formula is wrong).

### Add a new role

1. Add to `Role` enum in `prisma/schema.prisma`.
2. Run `prisma db push` on the VPS.
3. Add to `ALL_ROLES` in `src/lib/rbac.ts`.
4. Add a `LANDING` entry and `ROLE_PRIORITY` position in `rbac.ts`.
5. Add module access in `MODULES` and/or `ROUTE_ROLES` in `rbac.ts`.
6. Seed a demo user in `prisma/seed.ts`.

### Add a new module / page

1. Add a `ModuleDef` entry to `MODULES` in `rbac.ts` with the roles that can
   see it.
2. Add an entry to `ROUTE_ROLES` so `requireAnyRole()` can guard the layout.
3. Create the page under `src/app/(app)/your-module/`.
4. Add a layout that calls `requireAnyRole(ROUTE_ROLES["/your-module"])`.

### Change something on the thermal receipt

Edit the `.receipt` block in
[`src/app/(app)/cashier/checkout/[sessionId]/page.tsx`](../src/app/(app)/cashier/checkout/%5BsessionId%5D/page.tsx).
The `@media print` CSS in the same file controls what's visible vs hidden on
print. `PrintButton.tsx` calls `window.print()`.

### Add a realtime event

1. Define the event name and payload shape.
2. Call `emitKitchen(event, payload)`, `emitFloor(event, payload)`, or `emitHR(event, payload)` inside
   the relevant server action (after the DB write).
3. Add the event name to the `events` array in the `useRoomRefresh()` call
   inside the client component that should react to it.

### Run a DB schema change

```bash
# Production (Docker)
docker compose exec app npx prisma db push
docker compose up -d --build

# Development
npx prisma db push   # or: npx prisma migrate dev --name describe-your-change
```

---

## Seeded demo logins

Change all passwords after first deployment via HR → Employees → Account tab.

| Username | Password | Roles |
|---|---|---|
| `admin` | `admin123` | ADMIN + MANAGER |
| `owner` | `owner123` | All operational roles |
| `manager` | `manager123` | MANAGER |
| `waiter` | `waiter123` | WAITER |
| `waiter2` | `waiter123` | WAITER |
| `kitchen` | `kitchen123` | KITCHEN |
| `cashier` | `cashier123` | CASHIER |
| `hr` | `hr123` | HR |
