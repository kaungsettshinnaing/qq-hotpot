# QQ Hotpot BBQ — Restaurant Management System — project context

Full-stack restaurant management for **QQ Hotpot BBQ**, a buffet restaurant. POS, HR &
Payroll, Inventory and Accounting. **In production at https://app.qqhotpotbbq.com**, running
QQ Hotpot BBQ's daily operations. Note: that is **Simon's own shop**, so by his definition
this is not yet "live" — live means in use by external clients. Treat it as a real
production system with an internal customer. Part of the MMQR portfolio.

**Single-tenant today.** Simon's stated roadmap is to generalise this into a sellable
restaurant management product. It is **not yet built for that flexibility** — assume
QQ-specific behaviour is intentional until told otherwise.

> **Keep this file current.** Every session — Claude Code included — updates the relevant
> section below as part of finishing the work. Decisions, corrections and gotchas go in
> here so they are never re-explained.

> **Shared infrastructure:** the VPS layout, Postgres port map, domains, deploy
> conventions and known deployment traps live in
> `Claude Co-work/Infrastructure/VPS-INFRASTRUCTURE.md`. Update that file when
> infrastructure changes, not just this one.

---

## Read these before writing code

**`README.md` is excellent and accurate** — modules, roles, and how POS, HR and Inventory
actually work. Read it first. Then the deep docs:

| Doc | Covers |
|---|---|
| `docs/POS.md` | Point of sale detail |
| `docs/HR.md` | HR & payroll detail |
| `docs/INVENTORY.md` | Inventory and reconciliation detail |
| `docs/DEPLOY.md` | Deployment |
| `docs/GEMINI_TRANSLATION.md` | Translation workflow |
| `docs/TEST_SCRIPT.md` | Test script |

These docs were deliberately reconciled with the code — keep them that way when you change
behaviour.

## Stack

Next.js 15 (App Router, TypeScript, Server Actions) · PostgreSQL 16 + Prisma ·
**Socket.IO on a custom `server.ts`** (rooms: `kitchen`, `floor`, `hr`) · JWT cookies
(`jose`) + bcryptjs · Tailwind · `exceljs` (exports) · Docker + GitHub Actions CI/CD.

Note this is **Next.js 15 with a custom server** — unlike the Next 16 siblings. The custom
server exists for Socket.IO; do not "simplify" it away.

## Roles and access

Users can hold **multiple roles**; navigation auto-hides inaccessible modules, but
**`requireAnyRole()` server-side is the real enforcement** — never rely on hidden nav as a
security boundary.

Roles: WAITER · KITCHEN · CASHIER · MANAGER · HR · ADMIN.

## Domain rules that must not be guessed

**POS**
- Free pots per table: `free = ceil(diners / ratio)` (ratio default 4, configurable).
  Extras bill as **Pot Add-on**.
- Hotpot picks **2** soup flavours, BBQ picks **1** — both count as **one** pot.
- Tables open ≥ **105 minutes** show an orange **OVERDUE** badge on waiter and cashier
  floor views.
- Split payments: Cash / KBZPay / Other — **only cash affects the drawer**.
- Shift reconciliation: `expected = float + cash sales − cash-drawer expenses`.
- Reservations block a table from walk-ins for `reservationBlockMins` (default 90) before
  the booking.

**HR & Payroll**
- `payroll = basicSalary − absenceDeduction + otPremium + attendanceBonus + adHocBonuses
  − advances − fines`
- **Deductions are month-scoped.** An advance instalment or fine is collected *only* by the
  payroll for the month it was booked against — never swept forward into a later month. If
  a month's payroll is never locked, its instalments stay outstanding and HR must
  reschedule them from `/hr/advances`. Do not reintroduce roll-forward.
- **The attendance bonus pays `Employee.attendanceBonus`**, which is `0` unless HR sets it.
  Perfect attendance with a `0` entitlement correctly pays nothing.
- Both **ABSENT and LEAVE are unpaid**.
- **Locked payrolls are immutable** — there are payroll-lock guards; do not add a bypass.
- Employees marked **System** are view-only accounts excluded from attendance and payroll.

**Inventory**
- **Blind-count reconciliation:** the counter (kitchen/waiter) counts physical stock
  *without seeing* the cashier's invoice quantities. Auto-completes on match, flags a
  discrepancy for the manager otherwise. **Do not surface invoice quantities to the
  counter — that defeats the control.**
- **Stock levels are computed from movements** (`DELIVERY_IN`, `USAGE_OUT`, `ADJUSTMENT`).
  There is deliberately **no cached stock field** — do not add one.
- Partial deliveries create a new batch, each with its own cashier + counter flow.

**Accounting**
- Double-entry general journal exists specifically for **audit / IRD filing** (Myanmar tax
  authority). Treat journal correctness as compliance-critical, not cosmetic.

## Decisions made — and why

- `2026-10-20` — **Cash in / Cash out recorded twice on one tap — fixed with a per-submission
  request id, not just a disabled button.** Simon: "cash in and cash out button adds duplicate
  entries." Cause: `CollectionCard` had a plain submit button (never disabled while the request
  was in flight), gave no success feedback and never cleared the controlled amount field, so a
  second tap on a slow response re-posted the identical form and `createCashMovement` inserted
  again. Fix (3 layers): (1) `CashCollection.requestId` (nullable, **unique**) — the card mints
  a UUID after mount and re-mints after each success; `createCashMovement(type, amount, note,
  by, requestId)` returns the existing row for a repeated id and catches the P2002 race the same
  way, so two concurrent requests with one id still yield ONE row + ONE journal entry;
  (2) the button is disabled while pending (`useFormStatus`), shows "Recording…";
  (3) on success the amount/note clear and a "✓ Recorded" line shows for 6 s. Both callers
  (`cashier/actions.ts recordCashMovement`, `cash-collection/page.tsx recordCollection`) pass
  the id through `cleanRequestId`. Pinned by `src/lib/shift.test.ts` (double submit, P2002 race,
  no-id legacy path). Verified in the running app: a real double-click on Inject and on Withdraw
  each produced exactly one row and one journal entry. **Schema change ships via the normal
  `prisma db push` on deploy** (additive column; the deploy already passes `--accept-data-loss`,
  which the unique index needs). **Existing duplicate rows in prod were not touched** — Simon
  decides whether to void/offset them (each has its own journal entry).
  - **Rule going forward:** any form that creates a money or stock row needs BOTH a pending-
    disabled button (`SubmitButton` / `useFormStatus`) AND a server-side guard (a unique key,
    `updateMany` with a status condition, or a request id). A disabled button alone does not
    survive a retried request or a second tab.
- `2026-10-20` — **Bug sweep of every flow (same session, Simon: "check all other bugs").**
  Three read-only reviews (POS · HR/auth/admin · inventory/accounting/reports) → ~70 findings;
  the clear, behaviour-preserving ones were fixed, the rest are listed for Simon in the shared
  side-session note `qq-hotpot-bug-sweep-2026-10-20.md` (and summarised under "Known issues").
  Fixed: **expense / stock invoice / prepayment double-tap** (`Expense.requestId` unique +
  `expenseAlreadyRecorded`, the `ExpenseForm` resets and re-mints its id after every submit);
  **reservation "Seat" consumed the booking when the table was busy** (now checks open +
  merged first, claims BOOKED→SEATED conditionally); **conditional claims** on settle
  (`updateMany status OPEN`), close/force-close shift, `lockPayroll` (two Lock clicks used to
  rewrite every item with zero deductions), leave review (PENDING only), `approveStockIn` and
  `submitStockCount` (both now one transaction behind a claim — a double-tap credited stock /
  applied every adjustment twice); **`ErrorBanner`** (`src/components/ErrorBanner.tsx`,
  `?error=<code>` → `error_code_<code>` i18n key) on the 14 pages whose redirects were silent —
  the user saw nothing and tapped again, which is how duplicates start. **New `?error=` codes
  need an `error_code_*` key (en + mm) or the banner stays blank.** Also: OT on a scheduled rest
  day now counts (`summarizeAttendance`, pure + tested — it was skipped before the row was read,
  so rest-day OT earned nothing); KBZPay/Other above the bill rejected at entry; the checkout
  amount follows the live balance; void-pot / remove-discount refuse CLOSED sessions; cancel
  table enforced server-side (no pots/items/wastage); fines/advances validated server-side with
  banners (`validMoneyMonth`, `employeeExists` in `payroll-lock.ts`) instead of `throw`;
  journal export dates are Myanmar days; stock levels rounded to 3 dp (`roundQty`);
  usage/adjustment reject non-finite; reports `?date=` goes through `dayOr`; blank menu price no
  longer saves 0; the last active ADMIN / yourself can't be deactivated or deleted;
  `markReadAction` is scoped to the owner; HR month/date defaults use `mmNow()`/`mmToday()`;
  30 plain submit buttons on row-creating forms swapped for `SubmitButton`.
  - **Deliberately not changed (need Simon):** reversing journal entries for rejected expenses
    and deleted advances; snapshotting bill lines at settle; kitchen ghost pots; mandatory
    discount reason; DB-level "one OPEN session per table / one OPEN shift" (partial index, raw
    SQL); HR-vs-ADMIN account powers + master password in source + no login throttling; locking
    payroll before month end; clock-in overwriting OT; draft payslips visible; Socket.IO room
    auth; the supplier-spend double count; stock unit changes; hardcoded English bill labels.
  - **Verified:** `tsc`, `next lint` (only the pre-existing `<img>` warnings), vitest **39**
    (2 new files: `shift.test.ts`, `hr-attendance.test.ts`), and in the running local app: a
    real double-click on Cash in, Cash out and Add expense each produced exactly one row + one
    journal entry, the form cleared, and `?error=table-occupied` rendered its banner.
- `2026` — Complete Burmese/English localization across the app.
- `2026` — Downloadable raw revenue & expense data for the P&L range.
- `2026` — `PaymentStatus` enum **reordered** to avoid a Prisma `db push` issue on UAT.
  Do not reorder it back.
- `2026` — Flat journal entry list replaced with a **drillable daily ins/outs view**.
- `2026` — Double-entry general journal added for audit / IRD filing.
- `2026` — Force-close shift added, plus payroll-lock guards and inventory/security fixes.
- `2026` — Multiple rounds of fixes from **the owner's own code review** — stale JWT auth,
  a history-destroying delete, untraceable voids. Simon reviews this code; expect scrutiny.

## Deliberate placements — do not move

**Do not relocate or remove any of these without asking Simon first — propose instead.**

- Blind-count separation (counter must not see invoice quantities)
- Absence of a cached stock field
- Payroll immutability once locked

## Known issues and open questions

- **Not yet multi-tenant.** Generalising it for other restaurants is on the roadmap but
  not started — ask Simon before building abstraction for it.
- No `AGENTS.md` here, unlike the Next 16 siblings.
- **No payroll has ever been locked in prod** (Jun/Jul/Aug 2026 are all `DRAFT`), so
  nothing has ever been collected. As of the month-scoping change, ~565,000 MMK of July
  2026 advances no longer appear on the August payroll — they will only ever be collected
  if July's payroll is locked or HR reschedules them.
- **Payroll state in prod changed since 2026-09-04.** On 2026-10-05 prod showed Jun/Jul/Aug 2026
  **LOCKED** (Sep DRAFT) — the "nothing ever locked" note above is out of date. All 12 June
  items and 1 July + 1 Sep item have `grossPay = 0` (see the stale-`grossPay` gotcha below).
  **Not yet verified whether June's locked `netPay` was zeroed by it** — check before anyone
  relies on June figures. Locked rows are immutable, so any correction needs Simon's call.
- **Open items from the 2026-10-20 sweep (Simon's call, not fixed)** — full list with
  recommendations in the side-session note `qq-hotpot-bug-sweep-2026-10-20.md`: rejected
  expenses / deleted advances leave their journal entries (IRD export overstates expenses);
  closed bills are recomputed from live prices; kitchen keeps pots of settled tables; no
  DB uniqueness for one OPEN session per table / one OPEN shift; HR can reset an ADMIN's
  password; master password hash committed + no login throttling; payroll lockable mid-month;
  clock-in overwrites HR-marked OT; Socket.IO rooms unauthenticated; employees see DRAFT
  payslips; documents fetchable by any logged-in user; supplier spend double-counts prepaid
  batches; hardcoded English bill labels.
- Open items from the 2026-10-05 error audit that need Simon's decision (not fixed): stock
  invoices/prepayments never post to the journal (`createInvoiceDelivery`,
  `recordStockPrepayment`); invoice quantities are visible to the counter on the delivery
  detail page (blind-count leak); `resolveDelivery` can double-credit stock; half-day
  attendance is truncated (`Attendance.absentDays/otDays` are `Int`); rescheduling an advance
  double-posts it in the journal; stable `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` not set, so every
  deploy invalidates open tabs' server actions (the new `(app)/error.tsx` auto-reloads those).

## Things I got wrong before

- **The app containers run with `TZ=Asia/Yangon`** (`docker-compose*.yml` default, also in
  `.env.example`) — unlike the Next 16 siblings, which run UTC. So server-local `getHours()` /
  `getMonth()` / `new Date("YYYY-MM-DDTHH:mm")` from a `datetime-local` field are Myanmar time in
  prod and UAT. That is why the reservation `bookingAt` parse and `formatDate` look "wrong for UTC"
  but behave in production. Don't "fix" them to UTC math; if you touch them, go through
  `business-day.ts` so they stop depending on the TZ env at all. A local `.env` for dev must set
  `TZ=Asia/Yangon` too or dates will differ from prod.
- **Local dev recipe (2026-10-20):** `docker compose -f docker-compose.local.yml up -d qq-db`
  (Postgres on 127.0.0.1:5442, seeded volume `qq-app_qq_pgdata`), a `.env` with
  `DATABASE_URL=postgresql://qq:devpassword@localhost:5442/qq_dev`, `AUTH_SECRET`, `TZ=Asia/Yangon`,
  then `npx prisma db push --accept-data-loss` and `npm run dev` (port 3000). Logins are in
  `prisma/seed.ts`. The Browser pane's `preview_start` only reads the *session's own* launch.json,
  so from a JobLink-started session the server has to be started by hand and attached by URL.
- **A date taken from the URL must go through `dayOr()` / `isDayStr()`** (`src/lib/business-day.ts`).
  `sp.from ?? default` keeps an empty string (`?from=`), `mmDayRange("")` is an Invalid Date,
  and Prisma throws → 500 on /accounting, /cash-collection, /cashier/history and the exports.
- **Never cache an id obtained inside a transaction** (`getCoreAccount`): if the transaction
  rolls back, the cache points at a row that never existed and every later posting hits an FK
  error until restart. Only committed ids are cached now.
- **Stale `PayrollItem.grossPay`.** The column was added with `DEFAULT 0` and never backfilled,
  so draft items generated before 2026-07-28 have `grossPay = 0`; locking one allocates
  deductions against 0 and writes `netPay = 0`, irreversibly. `lockPayroll` now refuses and
  asks HR to Regenerate (a genuine all-absent zero is allowed — it checks the components).
- **Unique-constraint and double-submit crashes.** A second click on delete / merge / rename
  used to throw P2025/P2002 and show the blank production error page. Use `deleteMany`,
  catch via `isPrismaError(e, "P2002")` (`src/lib/prisma-errors.ts`), and redirect with
  `?error=…` + a banner. There is now an `(app)/error.tsx` boundary as a backstop.
- **Settle with KBZPay/Other above the bill** produced an unbalanced journal entry and rolled
  the settle back. `settleSession` now redirects to `?error=overpaid` instead.
- **Employee documents are served by `/api/uploads/...`**, not `/uploads/...` (nothing serves
  the latter). `EmployeeDocument.filePath` is stored as `/uploads/employees/<id>/<file>`;
  links prepend `/api`.

- **`onClick` on a Server Component 500s the page.** Both the payslip and the payroll
  print summary shipped with `<button onClick={() => window.print()}>` inside an `async`
  Server Component; Next throws *"Event handlers cannot be passed to Client Component
  props"* at request time, so both pages were dead in production. `window.print()` now
  lives in `hr/payroll/[yearMonth]/PrintButton.tsx` (`"use client"`) — reuse it, don't
  inline another handler. `npx tsc --noEmit` does **not** catch this; grep for `onClick`
  in files without `"use client"`.
- **Advances rolled forward across months.** The August payroll was deducting July's
  advances because uncollected instalments were swept into the current month. The business
  rule is month-scoped only — see HR & Payroll above.
