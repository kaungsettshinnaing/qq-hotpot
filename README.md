# QQ Hotpot BBQ — Restaurant Management System

A full-stack web app for **QQ Hotpot BBQ** (a buffet restaurant). Covers POS, HR & Payroll, and Inventory, deployed at **https://app.qqhotpotbbq.com**.

Built on **Next.js 15 App Router + PostgreSQL + Socket.IO** with role-based access, Docker deployment, and GitHub Actions CI/CD.

---

## Modules & roles

| Module | Who uses it | Roles with access |
|---|---|---|
| **Waiter** (tablet) | Open tables, order pots/beer/menu items/wastage, send to kitchen | WAITER, MANAGER, ADMIN |
| **Kitchen** (PC display) | See pending pot tickets, mark delivered, mute/unmute 15s beep | KITCHEN, MANAGER, ADMIN |
| **Cashier** (PC) | Checkout with full bill, split payments, discounts, reservations, expenses, shift reconciliation | CASHIER, MANAGER, ADMIN |
| **Reports** | Daily sales, covers, cash, shift variance | MANAGER, ADMIN |
| **Manager** | Live attendance, leave approvals, add fines, inventory discrepancy resolution | MANAGER, ADMIN |
| **HR & Payroll** | Employee onboarding, attendance, leave, payroll, advances, fines | HR, ADMIN |
| **Inventory** | Deliveries, blind-count reconciliation, stock levels, supplier spend | CASHIER, WAITER, KITCHEN, MANAGER, ADMIN |
| **My Account** | Own payslips, clock in/out/break, leave requests, password change | All roles |
| **Admin** | Tables, menu & settings, flavours, expense categories, stock items, suppliers, roles, custom fields | ADMIN |

Users can hold **multiple roles**; navigation auto-hides inaccessible modules. Server-side `requireAnyRole()` is the real enforcement.

---

## How the POS works

- **Free pots:** each table gets free pots based on headcount — `free = ceil(diners / ratio)` (ratio defaults to 4, configurable). Extra pots bill as **Pot Add-on**.
- **Pots → kitchen:** Hotpot picks **2** soup flavours, BBQ picks **1**; both count as one pot. New pots appear instantly on the kitchen display.
- **Menu items:** any non-system active menu item appears in the waiter session with +/− qty steppers. Charges appear as extra line items on the bill.
- **Overdue tables:** sessions open ≥ 105 minutes show an orange **OVERDUE** badge on both the waiter and cashier floor views.
- **Cashier:** computes bill (headcount + beer + paid pots + wastage + menu items), applies % or fixed discounts, takes split payments (Cash/KBZPay/Other — only **cash** affects the drawer), prints receipt, settles table.
- **Shift reconciliation:** `expected = float + cash sales − cash-drawer expenses` → variance at close.
- **Reservations:** table blocked from walk-ins for `reservationBlockMins` (default 90) before booking.

## How HR & Payroll works

- **Employees** are onboarded with login credentials, salary, rest days, and optional custom fields. Mark as **System** to create view-only accounts excluded from attendance and payroll.
- **Attendance:** tracked via clock in/out/break from My Account. Managers see live status. HR reviews the monthly grid (shows rest days automatically). Manual mark + approval workflow.
- **Leave:** employees submit single-day requests from My Account. HR/Manager approves → auto-creates LEAVE attendance record. Both ABSENT and LEAVE are unpaid.
- **Payroll:** generated per month for all active non-system employees. Formula: `basicSalary − absenceDeduction + otPremium + attendanceBonus + adHocBonuses − advances − fines`. Locked payrolls are immutable.
- **Fines & Advances:** HR, Admin, and Manager can create fines. Advances are linked to a target deduction month. Both are deducted at payroll generation.

## How Inventory works

- **Blind-count reconciliation:** cashier enters invoice quantities; counter (kitchen/waiter) independently counts physical stock without seeing the invoice. System auto-completes if they match; flags discrepancy for manager to resolve.
- **Stock levels** are computed from movements (no cached field): sum of all `DELIVERY_IN`, `USAGE_OUT`, and `ADJUSTMENT` movements.
- **Expenses auto-created** at payment time (pre-pay or invoice submit) — integrates with the cashier expense system.
- **Partial deliveries:** manager can mark a delivery partial, creating a new batch. Each batch goes through its own cashier+counter flow.

---

## Tech stack

- **Frontend/backend:** Next.js 15 (App Router, TypeScript, Server Actions)
- **Database:** PostgreSQL 16 + Prisma ORM
- **Realtime:** Socket.IO on a custom `server.ts` (rooms: `kitchen`, `floor`, `hr`)
- **Auth:** JWT cookies (jose) + bcryptjs; role-based access
- **Styles:** Tailwind CSS
- **Infra:** Docker + Traefik (auto-HTTPS via Let's Encrypt) + Hostinger VPS
- **CI/CD:** GitHub Actions → GHCR → SSH deploy

---

## Repository layout

```
qq-app/
  server.ts                  # custom Next.js + Socket.IO server
  middleware.ts              # session gate (edge)
  prisma/
    schema.prisma            # full data model
    seed.ts                  # demo data, roles, menu, settings, tables…
  src/
    app/
      (auth)/login/          # login page + action
      (app)/                 # authenticated shell + all modules
        waiter/  kitchen/  cashier/  reports/
        admin/   hr/  manager/  inventory/  my-account/
    components/              # AppShell, NavBar, BillSummary, SubmitButton…
    lib/                     # auth, rbac, pricing, orders, hr-payroll,
                             # hr-attendance, inventory, format, realtime…
  Dockerfile
  docker-compose.yml         # app + db, Traefik labels
  .github/workflows/deploy.yml
  docs/
    POS.md                   # POS developer reference
    HR.md                    # HR & Payroll developer reference
    INVENTORY.md             # Inventory developer reference
    DEPLOY.md                # Deployment guide
```

---

## Quick start (local dev)

Requires Node 20+ and a running PostgreSQL.

```bash
cd qq-app
npm install
cp .env.example .env        # set DATABASE_URL to your Postgres
npx prisma db push
npm run db:seed
npm run dev                 # http://localhost:3000
```

## Quick start (Docker)

```bash
cd qq-app
cp .env.example .env        # edit AUTH_SECRET, POSTGRES_PASSWORD
docker compose up -d --build
docker compose exec app npx prisma db seed   # first time only
# open http://localhost:3000
```

---

## Default logins

Change all passwords after first run (HR → Employees → profile → Account tab, or the Account tab in My Account).

| Username | Password | Roles |
|---|---|---|
| `admin` | `admin123` | Admin + Manager |
| `owner` | `owner123` | All operational roles |
| `manager` | `manager123` | Manager |
| `waiter` | `waiter123` | Waiter |
| `kitchen` | `kitchen123` | Kitchen |
| `cashier` | `cashier123` | Cashier |
| `hr` | `hr123` | HR |

---

## Deployment

See [`docs/DEPLOY.md`](docs/DEPLOY.md) for the full guide.

CI/CD is configured: every push to `main` runs typecheck, builds the Docker image, and deploys to the VPS automatically when `DEPLOY_ENABLED=true` is set in GitHub repo Variables.

**After a schema change**, run on the VPS:
```bash
docker compose exec app npx prisma db push
docker compose up -d --build
```

---

## Notes

- Money is whole-number **MMK**; currency/prices/rates are admin-configurable.
- Realtime is best-effort Socket.IO **with polling fallback** — screens stay correct if the socket drops.
- Date inputs across the app use **DD-MMM-YYYY** format (e.g. `26-Jun-2026`), parsed by `parseInputDate()` in `src/lib/format.ts`.
- UI is in English; structure leaves room for Burmese i18n.
