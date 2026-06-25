# QQ Hotpot BBQ — Restaurant Management (POS)

A web app for **QQ Hotpot BBQ** (a buffet restaurant). This first phase delivers
the **Point of Sale** module — waiter ordering, a realtime kitchen display,
cashier checkout with shift/cash reconciliation, reservations, expenses, and an
admin panel — on a role-based login foundation that the future **HR** module
will own and extend.

Built to deploy to a **Hostinger VPS with Docker**, an automated **CI/CD**
pipeline, and one-command environment setup.

---

## Modules & roles

| Module | Who uses it | Roles with access |
|---|---|---|
| **Waiter** (tablet) | Seat tables, order pots/beer/wastage, send to kitchen | WAITER, MANAGER, ADMIN |
| **Kitchen** (PC display) | See pending pots, mark delivered, 15s beep | KITCHEN, MANAGER, ADMIN |
| **Cashier** (PC) | Checkout, split payments, discounts, reservations, expenses, shift | CASHIER, MANAGER, ADMIN |
| **Reports** | Daily sales / covers / cash / shift variance | MANAGER, ADMIN |
| **Admin** | Areas/tables, menu prices & settings, flavours, categories, users/roles | ADMIN |

Users can hold **multiple roles**; the top navigation only shows modules the
user may access. `HR` and `MARKETING` roles are seeded for upcoming modules.

### How the POS works
- **Free pots:** each table gets free pots based on headcount —
  `free = ceil(diners / ratio)` (ratio defaults to 4, configurable). Extra pots
  bill automatically as a **Pot Add-on**.
- **Pots → kitchen:** a Hotpot picks **2** soup flavours, BBQ picks **1**; both
  count as one pot. New pots appear instantly on the kitchen display and beep
  every 15s until **Delivered**.
- **Cashier:** computes the bill from headcount + beer + paid pots + wastage
  grams, applies **% or fixed** discounts, takes **split** payments
  (Cash / KBZPay / Other — only **cash** affects the drawer), prints a receipt,
  and settles to free the table.
- **Shift reconciliation:** open a shift with a float → expected cash =
  `float + cash sales − cash-drawer expenses` → count drawer at close → variance.
- **Reservations:** a table is blocked from walk-ins for `reservationBlockMins`
  (default 90) before the booking time.

---

## Tech stack

Next.js 15 (App Router, TypeScript) · PostgreSQL + Prisma · Socket.IO (realtime,
via a custom server) · Tailwind · JWT cookie auth (jose + bcrypt) · Docker +
Caddy (auto-HTTPS) · GitHub Actions → GHCR → VPS.

## Repository layout

```
qq-app/
  server.ts                 # custom Next.js + Socket.IO server
  middleware.ts             # session gate (edge)
  prisma/
    schema.prisma           # data model
    seed.ts                 # roles, admin, menu, settings, sample tables…
    migrations/             # SQL migrations (prisma migrate deploy)
  src/
    app/
      (auth)/login/         # login
      (app)/                # authenticated shell + modules
        waiter/ kitchen/ cashier/ reports/ admin/
    components/             # AppShell, NavBar, BillSummary, LiveRefresh…
    lib/                    # auth, rbac, pricing, orders, shift, settings…
  Dockerfile  docker-compose.yml  Caddyfile  docker-entrypoint.sh
  .github/workflows/deploy.yml
  scripts/bootstrap-vps.sh
```

---

## Quick start (Docker — recommended)

```bash
cd qq-app
cp .env.example .env          # then edit values (AUTH_SECRET, passwords…)
docker compose up -d --build
docker compose exec app npm run db:seed   # first time only
# open http://localhost  (Caddy serves :80/:443; for localhost use http)
```

## Quick start (local dev, no Docker)

Requires Node 18.18+ and a PostgreSQL you can reach.

```bash
cd qq-app
npm install
cp .env.example .env          # set DATABASE_URL to your Postgres
npx prisma migrate deploy     # or: npx prisma db push
npm run db:seed
npm run dev                   # http://localhost:3000
```

## Environment variables (`.env`)

| Var | Purpose |
|---|---|
| `AUTH_SECRET` | Signs session JWTs — **must be long & random in prod** |
| `DATABASE_URL` | PostgreSQL connection string |
| `POSTGRES_USER/PASSWORD/DB` | Used by the `db` service + `DATABASE_URL` |
| `APP_DOMAIN` | Domain Caddy serves + gets HTTPS for (e.g. `app.qqhotpotbbq.com`) |
| `ACME_EMAIL` | Let's Encrypt registration email |
| `APP_IMAGE` | Image CI publishes (e.g. `ghcr.io/<owner>/<repo>:latest`) |
| `TZ` | Timezone (default `Asia/Yangon`) |

## Default logins (change after first run, in Admin → Users)

| Username | Password | Roles |
|---|---|---|
| `admin` | `admin123` | Admin + Manager |
| `owner` | `owner123` | all operational roles |
| `waiter` | `waiter123` | Waiter |
| `kitchen` | `kitchen123` | Kitchen |
| `cashier` | `cashier123` | Cashier |

---

## Deploy to Hostinger VPS

1. **DNS:** in Hostinger, add an **A record** `app.qqhotpotbbq.com → <VPS IP>`.
   (`cashbackapp.cloud` is reserved for a future customer loyalty/cashback app.)
2. **Bootstrap the VPS** (installs Docker, clones, configures, starts):
   ```bash
   ssh root@<VPS_IP>
   REPO_URL=https://github.com/<you>/<repo>.git \
     bash <(curl -fsSL https://raw.githubusercontent.com/<you>/<repo>/main/qq-app/scripts/bootstrap-vps.sh)
   # edit /opt/qq-app/qq-app/.env (domain, email, db password, APP_IMAGE), then re-run
   ```
3. **CI/CD:** every push to `main` runs typecheck + lint, builds the Docker image,
   and pushes it to **GHCR**. To auto-deploy, set repo **Variable**
   `DEPLOY_ENABLED=true` and these **Secrets**:

   | Secret | Description |
   |---|---|
   | `VPS_HOST` / `VPS_USER` / `VPS_SSH_KEY` | SSH into the VPS |
   | `VPS_APP_DIR` | e.g. `/opt/qq-app/qq-app` |
   | `GHCR_PAT` | PAT with `read:packages` (to pull the image on the VPS) |

   Migrations run automatically on container start (`prisma migrate deploy`).

---

## Verification checklist (end-to-end)

Run the stack, seed, then:
1. **RBAC** — log in as each demo user; confirm only permitted modules appear.
2. **Waiter→Kitchen** — open A1 with 5 diners → add 2 pots (auto **FREE**,
   ceil(5/4)=2) → a 3rd pot is **PAID** → BBQ enforces 1 flavour, Hotpot 2 →
   Kitchen shows tickets and beeps every 15s until **Delivered**.
3. **Cashier** — open a shift (float) → checkout A1 → verify the bill →
   discount → **split** Cash + KBZPay → settle → only cash hits the drawer →
   print receipt.
4. **Reservations** — book a table within 90 min → it shows **Reserved** on the
   floor; **Seat** opens a session.
5. **Expenses + Shift** — add a cash-drawer and a bank-transfer expense → close
   shift → variance reflects only cash sales − cash-drawer expenses.
6. **Admin** — add an area/table, change a price or the free-pot ratio, toggle
   service charge → confirm it flows into new bills. **Reports** shows the day.

---

## Roadmap (next modules)
HR & Payroll (owns logins/staff) · Inventory & Procurement · Accounting ·
Reservations/CRM & **Loyalty/Cashback** (fits `cashbackapp.cloud`) ·
Staff scheduling/attendance · BI dashboard · Audit log.

## Notes
- Money is whole-number **MMK**; currency/prices/rates are admin-configurable.
- Realtime is best-effort Socket.IO **with a polling fallback**, so screens stay
  correct even if the socket drops.
- UI is English now; structure leaves room for Burmese i18n later.
