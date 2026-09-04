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
- `docs/HR.md` referenced a `my-account/[yearMonth]/slip` self-service payslip route that
  does not exist. Left as-is; verify before relying on that section.

## Things I got wrong before

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
