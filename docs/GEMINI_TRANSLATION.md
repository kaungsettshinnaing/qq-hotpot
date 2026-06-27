# Translation Task — QQ Hotpot BBQ Management App

## What this app is
A Next.js 15 App Router restaurant management system for a Myanmar hotpot + BBQ restaurant.
Modules: Waiter (floor/table ordering), Kitchen (live order tickets), Cashier (shift/checkout/expenses),
Reports, Manager (attendance/leave/expenses), HR (payroll/employees), Inventory, Accounting, Admin.

---

## Your task (two parts)

### Part 1 — Fill in blank Burmese translations in `src/lib/i18n.ts`

The file contains a `dict` object. Every entry looks like:
```ts
some_key: { en: "English text", my: "မြန်မာဘာသာ" },
```

Some entries added for new features have `my: ""` (blank). Fill in every blank `my` value with
correct, natural Myanmar restaurant/business language. Do not change any `en` values or key names.
Do not change entries that already have a `my` translation.

**Terminology guide for consistency:**
- Shift → ဆင်ဒ် (used throughout existing translations)
- Cash drawer → ငွေဘောက်ချာ
- Table → စားပွဲ
- Pot (hotpot vessel) → ဆိုးပ်
- Bill → ဘီလ်
- Receipt / slip → ဘောင်ချာ
- Expense → ကုန်ကျစရိတ်
- Currency unit → ကျပ် (MMK)
- "Cashier" role → ငွေကောက်
- "Manager" role → မန်နေဂျာ
- Accrual / pre-paid (accounting) → ကြိုတင်မှတ်သားငွေ (or ကြိုတင်ပေးချေငွေ)
- Accounts Receivable → ငွေရမည့်အကောင့်
- Accounts Payable → ငွေပေးရမည့်အကောင့်
- P&L (Profit & Loss) → အမြတ်အရှုံး
- Handover → လွှဲပြောင်းမှု
- Reconciliation → စစ်ဆေးမှု
- Confirmed → အတည်ပြုပြီး
- Accrual (unconfirmed expense) → အတည်မပြုသောကုန်ကျစရိတ်

### Part 2 — Wire translations into every page

The infrastructure is ready. For **each Server Component page** listed below:

1. Add this import at the top of the file:
   ```ts
   import { getT } from "@/lib/lang";
   ```

2. At the start of the default export async function, add:
   ```ts
   const t = await getT();
   ```

3. Replace every hardcoded English UI string with `{t("key")}`, where `key` is the matching
   entry in `src/lib/i18n.ts`.

**String interpolation** (for strings with variables like `{name}`):
```ts
t("shift_handover_body", { name: otherShift.cashier.name, time: "9:00" })
```

**Client Components** (marked `"use client"` at the top) **cannot** use `getT()` directly.
Instead, pass the translated string as a prop from the parent Server Component:
```tsx
// In the Server Component parent:
const t = await getT();
<SomeClientComponent label={t("btn_clock_out")} />

// In the Client Component:
export default function SomeClientComponent({ label }: { label: string }) { ... }
```

---

## Worked example — simple page translation

**Before** (`src/app/(app)/cashier/shift/page.tsx` excerpt):
```tsx
export default async function CashierShiftPage() {
  // ...
  return (
    <div>
      <h1>Shift & Cash Reconciliation</h1>
      <p>Count the cash you start the drawer with (opening float).</p>
      <button>Open shift</button>
    </div>
  );
}
```

**After**:
```tsx
import { getT } from "@/lib/lang";

export default async function CashierShiftPage() {
  const t = await getT();
  // ...
  return (
    <div>
      <h1>{t("heading_shift_reconciliation")}</h1>
      <p>{t("shift_count_drawer")}</p>
      <button>{t("btn_open_shift")}</button>
    </div>
  );
}
```

---

## All pages to translate

Work through these files in order. Each one needs the `import { getT }` + `const t = await getT()`
pattern, then all visible UI strings replaced with `t("key")` calls.

### Auth
- `src/app/(auth)/login/page.tsx`

### Waiter
- `src/app/(app)/waiter/page.tsx`
- `src/app/(app)/waiter/open/[tableId]/page.tsx`
- `src/app/(app)/waiter/session/[id]/page.tsx`
  - `src/app/(app)/waiter/session/[id]/SessionControls.tsx` ← Client Component: accept translated strings as props

### Kitchen
- `src/app/(app)/kitchen/page.tsx`
  - `src/app/(app)/kitchen/KitchenLive.tsx` ← Client Component

### Cashier
- `src/app/(app)/cashier/page.tsx`
- `src/app/(app)/cashier/shift/page.tsx`
- `src/app/(app)/cashier/expenses/page.tsx`
- `src/app/(app)/cashier/tables/page.tsx`
- `src/app/(app)/cashier/checkout/[sessionId]/page.tsx`
  - `src/app/(app)/cashier/checkout/[sessionId]/CheckoutClient.tsx` ← Client Component

### Reports
- `src/app/(app)/reports/page.tsx`

### Manager
- `src/app/(app)/manager/page.tsx`
- `src/app/(app)/manager/attendance/page.tsx`
  - `src/app/(app)/manager/attendance/LiveAttendance.tsx` ← Client Component
- `src/app/(app)/manager/leave/page.tsx`
- `src/app/(app)/manager/expenses/page.tsx`
- `src/app/(app)/manager/inventory/page.tsx`

### My Account
- `src/app/(app)/my-account/page.tsx`
- `src/app/(app)/my-account/clock/page.tsx`
  - `src/app/(app)/my-account/clock/ClockOutButton.tsx` ← Client Component
- `src/app/(app)/my-account/leave/page.tsx`
- `src/app/(app)/my-account/leave/new/page.tsx`
- `src/app/(app)/my-account/account/page.tsx`

### HR
- `src/app/(app)/hr/page.tsx`
- `src/app/(app)/hr/employees/page.tsx`
- `src/app/(app)/hr/employees/new/page.tsx`
- `src/app/(app)/hr/employees/[id]/page.tsx`
- `src/app/(app)/hr/employees/[id]/edit/page.tsx`
- `src/app/(app)/hr/leave/page.tsx`
- `src/app/(app)/hr/attendance/page.tsx`
- `src/app/(app)/hr/payroll/page.tsx`
- `src/app/(app)/hr/payroll/[yearMonth]/page.tsx`
- `src/app/(app)/hr/payroll/[yearMonth]/slip/[employeeId]/page.tsx`
- `src/app/(app)/hr/advances/page.tsx`
- `src/app/(app)/hr/fines/page.tsx`

### Inventory
- `src/app/(app)/inventory/page.tsx`
- `src/app/(app)/inventory/deliveries/page.tsx`
- `src/app/(app)/inventory/deliveries/new/page.tsx`
- `src/app/(app)/inventory/deliveries/[id]/page.tsx`
- `src/app/(app)/inventory/deliveries/[id]/cashier/page.tsx`
- `src/app/(app)/inventory/deliveries/[id]/counter/page.tsx`
- `src/app/(app)/inventory/usage/page.tsx`
- `src/app/(app)/inventory/usage/new/page.tsx`
- `src/app/(app)/inventory/reports/page.tsx`

### Accounting
- `src/app/(app)/accounting/page.tsx`

### Admin
- `src/app/(app)/admin/page.tsx`
- `src/app/(app)/admin/tables/page.tsx`
- `src/app/(app)/admin/menu/page.tsx`
- `src/app/(app)/admin/flavours/page.tsx`
- `src/app/(app)/admin/categories/page.tsx`
- `src/app/(app)/admin/stock-items/page.tsx`
- `src/app/(app)/admin/suppliers/page.tsx`
- `src/app/(app)/admin/roles/page.tsx`
- `src/app/(app)/admin/hr-fields/page.tsx`

---

## Key architecture notes

- **`src/lib/i18n.ts`** — the translation dictionary (690 lines). This is your source of truth for key names.
- **`src/lib/lang.ts`** — `getLang()` reads the `lang` cookie (`"en"` or `"my"`); `getT()` returns the translation function.
- **`src/components/LangToggle.tsx`** — already wired into the app shell nav bar (top right). No changes needed here.
- The toggle sets a `lang` cookie (1-year expiry) and does `location.reload()`. No URL changes needed.
- **Do not** add `"use client"` to pages just to use translations. Always pass translated strings down as props to Client Components.
- If a key is missing from `src/lib/i18n.ts`, add it to the dict (follow the existing naming convention: `section_*`, `btn_*`, `heading_*`, `badge_*`, `label_*`, `placeholder_*`, `empty_*`, `msg_*`).

---

## Checklist for each file

- [ ] `import { getT } from "@/lib/lang"` added
- [ ] `const t = await getT()` added inside the async function
- [ ] All hardcoded English UI strings replaced with `t("key")`
- [ ] Client sub-components receive translated strings as props (not calling `getT` themselves)
- [ ] No `en` values or key names changed in `i18n.ts`
- [ ] TypeScript compiles (`npx tsc --noEmit` passes)
