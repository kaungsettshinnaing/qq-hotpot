# POS Module — Developer Reference

This document is the definitive reference for the Point of Sale module of
**QQ Hotpot BBQ**. Read it before making changes to avoid breaking locked
business rules.

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
Guest arrives → Waiter opens table → Waiter adds pots/beer/wastage
    → Kitchen sees pots, marks Delivered
    → Cashier computes bill, takes split payment, settles table
    → Cashier closes shift, reconciles cash drawer
```

Alongside the core flow: **table reservations**, **shift-based cash
reconciliation**, **expenses**, and a **Manager/Admin** oversight layer
(reports, configuration, user management).

---

## 2. Role access map

| Role | Module | Landing after login |
|---|---|---|
| `WAITER` | `/waiter` | `/waiter` |
| `KITCHEN` | `/kitchen` | `/kitchen` |
| `CASHIER` | `/cashier` | `/cashier` |
| `MANAGER` | `/waiter` `/kitchen` `/cashier` `/reports` | `/reports` |
| `ADMIN` | everything + `/admin` | `/admin` |
| `HR` | (future) | `/` |
| `MARKETING` | (future) | `/` |

Users can hold **multiple roles** simultaneously. Navigation auto-hides
modules the user cannot access — but server-side `requireAnyRole()` in
each layout is the actual enforcement.

Source: [`src/lib/rbac.ts`](../src/lib/rbac.ts)

---

## 3. User journeys

### 3.1 Waiter (tablet)

1. Open `/waiter` — sees live table grid (colour-coded: Available / Occupied /
   Reserved / Inactive).
2. Tap an available table → `/waiter/open/[tableId]` → enter **Adults** and
   **Children** counts → **Open Table** creates a `TableSession` (OPEN).
3. Session page `/waiter/session/[id]`:
   - **Add Pot** — pick kind (BBQ or Hotpot), pick soup flavours (BBQ = 1,
     Hotpot = 2), submit. Each pot is auto-marked free/paid at creation time
     using the free-pot formula (see §6.1). Sends `kitchen:pot:new` event.
   - **Set Beer** — quantity of beer bottles for the table.
   - **Set Wastage** — grams of food wasted (also editable by cashier).
   - **Update Headcount** — changing adults/children recalculates which pots
     are free/paid on the bill (note: `isFree` flag on historical pots is NOT
     retroactively changed; only the computed bill view changes).
   - **Void Pot** — removes a pending pot (sends `kitchen:pot:void`).
   - **Cancel Session** — only if no payments have been made.

### 3.2 Kitchen (PC display)

1. Open `/kitchen` — sees all PENDING pot tickets across all open sessions,
   grouped by table.
2. **Enable Sound** button must be clicked once to unlock the browser audio
   context. After that, a **15-second beep** fires automatically while any
   pot has PENDING status.
3. Click **Delivered** on a ticket — marks `PotOrder.status = DELIVERED`,
   emits `kitchen:pot:delivered`. Ticket moves to history.
4. The screen auto-refreshes via Socket.IO events **and** a 5-second polling
   fallback.

### 3.3 Cashier (PC)

**Checkout flow:**
1. `/cashier` — sees open sessions list (table label, diners, time open).
2. Click a session → `/cashier/checkout/[sessionId]`:
   - View full bill breakdown (headcount, beer, paid pots, wastage, discount,
     service, tax, total already paid, balance due).
   - **Set Discount** — % or fixed, with a mandatory reason. No approval needed.
   - **Edit Wastage** — cashier can also enter/correct wastage grams.
   - **Add Payment** — Cash, KBZPay, or Other; partial amounts allowed (split
     payments). Only CASH payments link to the open shift.
   - **Settle** — button enabled only when `balance ≤ 0`. Closes the session
     (CLOSED), frees the table, redirects to settled view for receipt print.
   - **Print Receipt** — calls `window.print()`, CSS `@media print` shows only
     `.receipt` block (thermal-friendly).

**Tables / Reservations:**
- `/cashier/tables` — live floor map + reservation list.
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
- **Open Shift**: enter opening float (starting cash in drawer).
- **Close Shift**: counts actual cash in drawer → system computes
  `expected = float + cash_sales − cash_drawer_expenses` → shows `variance`.

### 3.4 Manager

Has access to Waiter + Kitchen + Cashier + Reports. Can view all shifts and
daily reports. Has an optional **PIN** (`User.pinHash`) for future manager
approval flows (void-after-send, overrides).

### 3.5 Admin

Full access including `/admin`:
- **Tables** — create/toggle Areas and Tables.
- **Menu** — change prices for Adult, Child, Beer, Pot Add-on, Wastage.
- **Settings** — free-pot ratio, rounding, reservation block minutes, tax/service toggles + rates, currency, restaurant name.
- **Flavours** — add/toggle soup flavours; set `appliesTo` (HOTPOT/BBQ/BOTH).
- **Categories** — add/toggle expense categories.
- **Users** — create users, assign roles, reset passwords, deactivate.

---

## 4. File map

### Core library (`src/lib/`)

| File | Purpose |
|---|---|
| [`auth.ts`](../src/lib/auth.ts) | JWT sessions (12h), cookie `qq_session`, `requireSession()`, `requireAnyRole()`, `hashPassword`, `hashPin` |
| [`rbac.ts`](../src/lib/rbac.ts) | Role enum, `MODULES` array, `modulesFor()`, `landingFor()`, `ROUTE_ROLES` |
| [`db.ts`](../src/lib/db.ts) | Singleton `PrismaClient` via `globalThis.__qq_prisma` |
| [`realtime.ts`](../src/lib/realtime.ts) | `emitKitchen()`, `emitFloor()`, `setIO()` — Socket.IO bridge |
| [`pricing.ts`](../src/lib/pricing.ts) | `freePotsAllowed()`, `paidPotCount()`, `computeBill()` — pure, no DB |
| [`orders.ts`](../src/lib/orders.ts) | `getSessionDetail()` — loads session + computes full bill |
| [`shift.ts`](../src/lib/shift.ts) | `getOpenShift()`, `computeShiftTotals()` |
| [`settings.ts`](../src/lib/settings.ts) | `getSettings()` — reads `Setting` rows from DB |
| [`menu.ts`](../src/lib/menu.ts) | `getMenuPrices()` — reads `MenuItem` prices from DB |
| [`floor.ts`](../src/lib/floor.ts) | Floor / table availability helpers |
| [`format.ts`](../src/lib/format.ts) | `formatMMK()`, date/time formatters |
| [`action-result.ts`](../src/lib/action-result.ts) | Shared `ActionResult` type (`{ ok: true } \| { ok: false; error: string }`) |
| [`socket-client.ts`](../src/lib/socket-client.ts) | `useRoomRefresh()` hook — joins a Socket.IO room, triggers `router.refresh()` on events |
| [`session-actions.ts`](../src/lib/session-actions.ts) | Shared session/auth server utilities |

### Server actions (per module)

| File | Key actions |
|---|---|
| [`(app)/waiter/actions.ts`](../src/app/(app)/waiter/actions.ts) | `openTable`, `addPot`, `setBeerQty`, `setWastage`, `updateHeadcount`, `voidPot`, `cancelSession` |
| [`(app)/kitchen/actions.ts`](../src/app/(app)/kitchen/actions.ts) | `deliverPot` |
| [`(app)/cashier/actions.ts`](../src/app/(app)/cashier/actions.ts) | `addPayment`, `setDiscount`, `setWastage`, `settleSession`, `openShift`, `closeShift`, `addExpense`, `createReservation`, `seatReservation`, `cancelReservation`, `noShowReservation` |
| [`(app)/admin/actions.ts`](../src/app/(app)/admin/actions.ts) | `createArea`, `toggleArea`, `createTable`, `toggleTable`, `updateMenuItem`, `updateSettings`, `createFlavour`, `toggleFlavour`, `createCategory`, `toggleCategory`, `createUser`, `updateUserRoles`, `setUserActive`, `resetUserPassword` |
| [`(auth)/login/actions.ts`](../src/app/(auth)/login/actions.ts) | `loginAction` |

### Pages & components

| Path | What it renders |
|---|---|
| `/waiter` | Table grid (live status) |
| `/waiter/open/[tableId]` | Headcount form to open a session |
| `/waiter/session/[id]` | Active session: pots, beer, wastage controls |
| `/kitchen` | Pending pot tickets + beep; `KitchenLive.tsx` is the client component |
| `/cashier` | Open sessions list |
| `/cashier/checkout/[sessionId]` | Full bill, discount, payment, settle, print |
| `/cashier/tables` | Floor map + reservations |
| `/cashier/expenses` | Expense form + today's list |
| `/cashier/shift` | Open/close shift, totals |
| `/reports` | Daily sales summary |
| `/admin` | Admin sub-nav |
| `/admin/tables` | Area + table CRUD |
| `/admin/menu` | Price editing |
| `/admin/flavours` | Soup flavour management |
| `/admin/categories` | Expense category management |
| `/admin/users` | User + role management |

### Shared components

| Component | Purpose |
|---|---|
| `AppShell.tsx` | Auth'd layout wrapper + nav |
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
| [`docker-compose.yml`](../docker-compose.yml) | `app` + `db` (postgres:16) + `caddy` |
| [`Caddyfile`](../Caddyfile) | Auto-HTTPS + WebSocket passthrough → `app:3000` |
| [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) | CI/CD: typecheck → build image → push GHCR → SSH deploy |
| [`scripts/bootstrap-vps.sh`](../scripts/bootstrap-vps.sh) | One-shot VPS setup (Docker, `.env`, seed) |

---

## 5. Data model

Key relationships (see full schema at [`prisma/schema.prisma`](../prisma/schema.prisma)):

```
User
├── TableSession (openedBy / closedBy)
├── PotOrder (createdBy / deliveredBy)
├── Payment (receivedBy)
├── Expense (enteredBy)
├── CashierShift
└── Reservation (createdBy)

Area
└── Table
    ├── TableSession
    └── Reservation

TableSession
├── PotOrder
│   └── PotOrderFlavour → SoupFlavour
├── OrderItem (BEER; extensible)
└── Payment → CashierShift

CashierShift
├── Payment (CASH only → affects reconciliation)
└── Expense (CASH_DRAWER only → affects reconciliation)
```

### Key enums

| Enum | Values |
|---|---|
| `Role` | WAITER / KITCHEN / CASHIER / MANAGER / ADMIN / HR / MARKETING |
| `MenuItemCode` | ADULT / CHILD / BEER / POT_ADDON / WASTAGE |
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
- `isFree` is stamped on each `PotOrder` **at creation time** (in `addPot` action).
  Changing headcount after the fact does NOT retroactively flip `isFree`; the
  bill re-computes paid pot count from total pots vs new allowance.

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

afterDiscount = subtotal − discount
  where discount = subtotal × pct/100    (PERCENT)
               or  min(subtotal, fixedAmt) (FIXED)

serviceCharge = afterDiscount × serviceRate/100   (if serviceEnabled)
tax           = (afterDiscount + serviceCharge) × taxRate/100  (if taxEnabled)

total = afterDiscount + serviceCharge + tax
```

Source: [`src/lib/pricing.ts:71`](../src/lib/pricing.ts#L71) — `computeBill()`.

All amounts are **whole MMK** (Math.round applied to percent calculations).

### 6.4 Split payments

- Multiple `Payment` rows per `TableSession` are allowed.
- `balance = bill.total − Σ(payments.amount)`.
- **Settle** is only enabled when `balance ≤ 0`.
- Only `CASH` payments are linked to `CashierShift` and affect cash
  reconciliation. `KBZPAY` and `OTHER` are recorded but excluded from the
  drawer.

### 6.5 Shift reconciliation

```
expected = openingFloat + Σ(CASH payments in shift) − Σ(CASH_DRAWER expenses in shift)
variance = countedCash − expected
```

Source: [`src/lib/shift.ts:18`](../src/lib/shift.ts#L18) — `computeShiftTotals()`.

One cashier → one OPEN shift at a time. Multiple shifts per day are allowed.
BANK_TRANSFER expenses are **excluded** from reconciliation.

### 6.6 Table reservation blocking

A table is considered **reserved/unavailable** during the window:
```
[bookingAt − blockMins, bookingAt + durationMin]
```

- `blockMins` default = **90** (configurable via `Setting.reservationBlockMins`).
- `durationMin` default = **120** (stored per reservation).
- Status `SEATED` or `CANCELLED` lifts the block.

### 6.7 Discounts

- Applied by **cashier freely** — no manager approval required.
- Type: `PERCENT` (0–100%) or `FIXED` (capped at subtotal).
- `discountReason` field is required (enforced in UI, schema allows null for
  programmatic use).
- Discount is stored on `TableSession`, not on individual items.

### 6.8 Wastage

- Entered in **grams** by either waiter (`setWastage` in waiter actions) or
  cashier (`setWastage` in cashier actions) — last write wins.
- Billed at `priceWastage MMK/gram` (MenuItem code = WASTAGE).

### 6.9 Tax and service charge

Both are **off by default**. Configured via admin settings:
- `taxEnabled` (bool) + `taxRatePct` (number)
- `serviceEnabled` (bool) + `serviceRatePct` (number)

Service is applied to `afterDiscount`; tax is applied to
`afterDiscount + serviceCharge`.

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

### Events emitted by server actions

| Event | Room | Trigger | Payload |
|---|---|---|---|
| `pot:new` | `kitchen` | `addPot` | `{ sessionId }` |
| `pot:void` | `kitchen` | `voidPot` | `{ sessionId, potId }` |
| `pot:delivered` | `kitchen` | `deliverPot` | `{ potId }` |
| `table:update` | `floor` | `openTable`, `settleSession`, `cancelSession`, `seatReservation`, `addPot` | `{ tableId }` |

All emits are **best-effort** (try/catch, no error thrown). If the socket is
unavailable, clients poll via `AutoRefresh` (5-second interval on kitchen,
`router.refresh()` driven).

Source: [`src/lib/realtime.ts`](../src/lib/realtime.ts),
[`src/lib/socket-client.ts`](../src/lib/socket-client.ts),
[`src/components/LiveRefresh.tsx`](../src/components/LiveRefresh.tsx)

### Kitchen beep

- Implemented in `KitchenLive.tsx` using **Web Audio API** (`AudioContext`,
  880 Hz sine, 0.4 s).
- Fires every **15 seconds** while `pendingCount > 0`.
- Requires a user click ("Enable Sound") to unlock the `AudioContext` — browser
  autoplay policy.

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

Changed via Admin → Settings (server action `updateSettings`).

---

## 9. Common change patterns

### Add a new menu item type

1. Add code to `MenuItemCode` enum in `prisma/schema.prisma`.
2. Add a seed row in `prisma/seed.ts`.
3. Add a `MenuUnit` if needed.
4. Add an `add()` line in `computeBill()` in `pricing.ts`.
5. Add it to the waiter session controls in `waiter/session/[id]/SessionControls.tsx`.
6. Add the corresponding server action in `waiter/actions.ts`.

### Change the free-pot formula

Edit `freePotsAllowed()` in [`src/lib/pricing.ts:48`](../src/lib/pricing.ts#L48).
The `ratio` and `rounding` args come from `getSettings()`. To change defaults,
update the seed values for `freePotRatio` and `freePotRounding` in
[`prisma/seed.ts`](../prisma/seed.ts).

### Add a new payment method

1. Add the value to `PaymentMethod` enum in the schema.
2. Add a migration.
3. Update the cashier checkout UI to offer the new method.
4. Decide whether it affects shift reconciliation (update `computeShiftTotals`
   if so — currently only `CASH` does).

### Add a new role

1. Add to `Role` enum in `prisma/schema.prisma`.
2. Add a migration.
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
2. Call `emitKitchen(event, payload)` or `emitFloor(event, payload)` inside
   the relevant server action (after the DB write).
3. Add the event name to the `events` array in the `useRoomRefresh()` call
   inside the client component that should react to it.

### Change shift reconciliation logic

Edit `computeShiftTotals()` in [`src/lib/shift.ts:18`](../src/lib/shift.ts#L18).
The formula is: `expected = openingFloat + cashSales − cashExpenses`.

### Run a DB migration after schema changes

```bash
# Development (applies + generates client)
npx prisma migrate dev --name describe-your-change

# Production (Docker — runs automatically on container start)
npx prisma migrate deploy
```

---

## Seeded demo logins

Change all passwords after first deployment via Admin → Users.

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
