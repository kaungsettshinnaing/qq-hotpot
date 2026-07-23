import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { formatMoney, formatDateTime } from "@/lib/format";
import { mmNow, mmDayRange } from "@/lib/business-day";
import { getSessionDetail } from "@/lib/orders";
import { netCashChange } from "@/lib/pricing";
import { getT } from "@/lib/lang";
import MovementsTable from "../reports/MovementsTable";

export const dynamic = "force-dynamic";

// ── Server actions ────────────────────────────────────────────────────────────

async function markReceived(fd: FormData) {
  "use server";
  await requireAnyRole(["ADMIN"]);
  const id = fd.get("id") as string;
  await prisma.payment.update({ where: { id }, data: { reconciledAt: new Date() } });
  revalidatePath("/accounting");
}

async function markPaid(fd: FormData) {
  "use server";
  await requireAnyRole(["ADMIN"]);
  const id = fd.get("id") as string;
  await prisma.expense.update({ where: { id }, data: { paidAt: new Date() } });
  revalidatePath("/accounting");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(d: Date | null | undefined) {
  if (!d) return "—";
  return d.toLocaleString([], { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtDate(d: Date) {
  return d.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" });
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; from?: string; to?: string }>;
}) {
  await requireAnyRole(["ADMIN"]);
  const t = await getT();
  const sp = await searchParams;
  const tab = sp.tab ?? "ar";

  // Date range — default to current Myanmar month
  const nowMM = mmNow();
  const cy = nowMM.getUTCFullYear();
  const cm = String(nowMM.getUTCMonth() + 1).padStart(2, "0");
  const lastDay = new Date(Date.UTC(cy, nowMM.getUTCMonth() + 1, 0)).getUTCDate();
  const defaultFrom = `${cy}-${cm}-01`;
  const defaultTo   = `${cy}-${cm}-${String(lastDay).padStart(2, "0")}`;

  const fromStr = sp.from ?? defaultFrom;
  const toStr   = sp.to   ?? defaultTo;

  // Myanmar calendar-day boundaries — same convention as /reports
  const rangeStart = mmDayRange(fromStr).start;
  const rangeEnd   = mmDayRange(toStr).end; // exclusive end

  // ── Summary card queries (always unfiltered — show current outstanding) ────
  const [pendingPayments, accrualExpenses, confirmedPendingExpenses] = await Promise.all([
    prisma.payment.findMany({
      where: { method: { in: ["KBZPAY", "OTHER"] }, reconciledAt: null, voidedAt: null },
      include: { session: { include: { table: { select: { label: true } } } }, receivedBy: { select: { name: true } } },
      orderBy: { receivedAt: "asc" },
    }),
    prisma.expense.findMany({
      where: { paymentSource: "BANK_TRANSFER", confirmedAt: null, rejectedAt: null },
      include: { category: { select: { name: true } }, enteredBy: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.expense.findMany({
      where: { paymentSource: "BANK_TRANSFER", confirmedAt: { not: null }, paidAt: null, rejectedAt: null },
      include: { category: { select: { name: true } }, enteredBy: { select: { name: true } } },
      orderBy: { businessDate: "asc" },
    }),
  ]);

  // ── Date-filtered queries (history sections + P&L) ────────────────────────
  const [reconciledPayments, paidExpenses, plExpenses, plSessions] = await Promise.all([
    prisma.payment.findMany({
      where: { method: { in: ["KBZPAY", "OTHER"] }, reconciledAt: { gte: rangeStart, lt: rangeEnd }, voidedAt: null },
      include: { session: { include: { table: { select: { label: true } } } }, receivedBy: { select: { name: true } } },
      orderBy: { receivedAt: "desc" },
    }),
    prisma.expense.findMany({
      where: { paymentSource: "BANK_TRANSFER", paidAt: { gte: rangeStart, lt: rangeEnd } },
      include: { category: { select: { name: true } }, enteredBy: { select: { name: true } } },
      orderBy: { businessDate: "desc" },
    }),
    tab === "pl"
      ? prisma.expense.findMany({
          where: { businessDate: { gte: rangeStart, lt: rangeEnd }, rejectedAt: null },
          include: { category: { select: { name: true } } },
        })
      : Promise.resolve([]),
    tab === "pl"
      ? prisma.tableSession.findMany({
          where: { status: "CLOSED", closedAt: { gte: rangeStart, lt: rangeEnd } },
          select: {
            id: true, adults: true, children: true, billTotal: true,
            openedAt: true, closedAt: true,
            table: { select: { label: true } },
            mergedTables: { select: { table: { select: { label: true } } } },
            payments: { where: { voidedAt: null }, select: { method: true, amount: true } },
          },
          orderBy: { closedAt: "asc" },
        })
      : Promise.resolve([]),
  ]);

  // ── P&L aggregation ───────────────────────────────────────────────────────
  // Derived entirely from plSessions (closedAt-filtered) — the same universe
  // as the itemized movementRows below, so the P&L total and the itemized
  // total can never disagree due to a receivedAt-vs-closedAt filter mismatch.
  // Change is deducted per-session via netCashChange (non-cash tenders cover
  // the bill first; only genuine excess cash counts as change).
  const revenue = { cash: 0, kbz: 0, other: 0 };
  for (const s of plSessions) {
    const billTotal = s.billTotal ?? s.payments.reduce((sum, p) => sum + p.amount, 0);
    const cashPaid = s.payments.filter((p) => p.method === "CASH").reduce((sum, p) => sum + p.amount, 0);
    revenue.cash += cashPaid - netCashChange(s.payments, billTotal);
    revenue.kbz += s.payments.filter((p) => p.method === "KBZPAY").reduce((sum, p) => sum + p.amount, 0);
    revenue.other += s.payments.filter((p) => p.method === "OTHER").reduce((sum, p) => sum + p.amount, 0);
  }
  const totalRevenue = revenue.cash + revenue.kbz + revenue.other;

  const expByCat = new Map<string, { name: string; confirmed: number; accrual: number }>();
  for (const e of plExpenses) {
    const key = e.categoryId;
    const row = expByCat.get(key) ?? { name: e.category.name, confirmed: 0, accrual: 0 };
    if (e.confirmedAt) row.confirmed += e.amount;
    else row.accrual += e.amount;
    expByCat.set(key, row);
  }
  const totalExpenses = plExpenses.reduce((s, e) => s + e.amount, 0);
  const netPL = totalRevenue - totalExpenses;

  // Itemized income — per-session breakdown (bill line items aren't stored, recompute each).
  const movementRows = await Promise.all(
    plSessions.map(async (s) => {
      const bill = (await getSessionDetail(s.id))?.bill ?? null;
      return {
        id: s.id,
        tableLabel: [s.table.label, ...s.mergedTables.map((m) => m.table.label)].join(" + "),
        adults: s.adults,
        children: s.children,
        revenue: s.billTotal ?? bill?.total ?? 0,
        start: formatDateTime(s.openedAt),
        end: s.closedAt ? formatDateTime(s.closedAt) : "—",
        lines: (bill?.lines ?? []).map((l) => ({
          label: l.label, qty: l.qty, unitLabel: l.unitLabel, unitPrice: l.unitPrice, amount: l.amount,
        })),
        subtotal: bill?.subtotal ?? 0,
        discount: bill?.discount ?? 0,
        serviceCharge: bill?.serviceCharge ?? 0,
        tax: bill?.tax ?? 0,
        total: bill?.total ?? (s.billTotal ?? 0),
      };
    }),
  );
  const movementsRevenue = movementRows.reduce((s, r) => s + r.revenue, 0);
  const totalAdults = plSessions.reduce((s, x) => s + x.adults, 0);
  const totalChildren = plSessions.reduce((s, x) => s + x.children, 0);

  // Income by menu item — aggregated across every session in range.
  const incomeByItem = new Map<string, { label: string; qty: number; amount: number }>();
  for (const r of movementRows) {
    for (const l of r.lines) {
      const row = incomeByItem.get(l.label) ?? { label: l.label, qty: 0, amount: 0 };
      row.qty += l.qty;
      row.amount += l.amount;
      incomeByItem.set(l.label, row);
    }
  }

  const pendingARTotal   = pendingPayments.reduce((s, p) => s + p.amount, 0);
  const accrualTotal     = accrualExpenses.reduce((s, e) => s + e.amount, 0);
  const confirmedAPTotal = confirmedPendingExpenses.reduce((s, e) => s + e.amount, 0);

  const tabs = [
    { key: "ar", label: t("tab_ar") },
    { key: "ap", label: t("tab_ap") },
    { key: "pl", label: t("tab_pl") },
  ];

  return (
    <div className="space-y-5 px-4 py-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900">{t("heading_accounting")}</h1>

      {/* Summary cards — always show current outstanding */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">{t("stat_pending_receivable")}</p>
          <p className="mt-1 text-xl font-extrabold text-blue-700">{formatMoney(pendingARTotal)}</p>
          <p className="text-xs text-gray-400">{t("label_n_txn", { n: String(pendingPayments.length) })}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">{t("stat_accruals_unconfirmed")}</p>
          <p className="mt-1 text-xl font-extrabold text-amber-600">{formatMoney(accrualTotal)}</p>
          <p className="text-xs text-gray-400">{t("label_n_expenses", { n: String(accrualExpenses.length) })}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">{t("stat_confirmed_payable")}</p>
          <p className="mt-1 text-xl font-extrabold text-red-700">{formatMoney(confirmedAPTotal)}</p>
          <p className="text-xs text-gray-400">{t("label_n_txn", { n: String(confirmedPendingExpenses.length) })}</p>
        </div>
      </div>

      {/* Tab strip */}
      <div className="flex gap-1 border-b">
        {tabs.map((tb) => (
          <a
            key={tb.key}
            href={`/accounting?tab=${tb.key}&from=${fromStr}&to=${toStr}`}
            className={
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors " +
              (tab === tb.key
                ? "border-brand-dark text-brand-dark"
                : "border-transparent text-gray-500 hover:text-gray-700")
            }
          >
            {tb.label}
            {tb.key === "ar" && pendingPayments.length > 0 && (
              <span className="ml-1.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                {pendingPayments.length}
              </span>
            )}
            {tb.key === "ap" && (accrualExpenses.length + confirmedPendingExpenses.length) > 0 && (
              <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                {accrualExpenses.length + confirmedPendingExpenses.length}
              </span>
            )}
          </a>
        ))}
      </div>

      {/* Date range filter — applies to AR history, AP history, and P&L */}
      <form method="GET" action="/accounting" className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="tab" value={tab} />
        <span className="text-xs font-medium text-gray-500">Date range</span>
        <input
          type="date"
          name="from"
          defaultValue={fromStr}
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
        />
        <span className="text-xs text-gray-400">→</span>
        <input
          type="date"
          name="to"
          defaultValue={toStr}
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark active:scale-95 transition"
        >
          Apply
        </button>
        <a
          href={`/accounting?tab=${tab}&from=${defaultFrom}&to=${defaultTo}`}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          This month
        </a>
      </form>

      {/* ── Accounts Receivable ── */}
      {tab === "ar" && (
        <div className="space-y-5">
          {pendingPayments.length > 0 ? (
            <div className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                {t("section_pending_recon")} ({pendingPayments.length})
              </h2>
              {pendingPayments.map((p) => (
                <div key={p.id} className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-900">{formatMoney(p.amount)}</span>
                      <span className={
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold " +
                        (p.method === "KBZPAY" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600")
                      }>{p.method}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {t("label_table_prefix")} {p.session.table.label} · {fmt(p.receivedAt)}
                      {p.reference && <> · Ref: {p.reference}</>}
                    </p>
                    <p className="text-[11px] text-gray-400">{t("label_received_by")} {p.receivedBy.name}</p>
                  </div>
                  <form action={markReceived}>
                    <input type="hidden" name="id" value={p.id} />
                    <button type="submit" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 active:scale-95 transition">
                      {t("btn_received")}
                    </button>
                  </form>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-gray-400">{t("msg_no_pending_ar")}</p>
          )}

          <div className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              {t("section_reconciled_history")} ({reconciledPayments.length})
            </h2>
            {reconciledPayments.length === 0 ? (
              <p className="rounded-xl border bg-white px-4 py-4 text-center text-sm text-gray-400">
                No reconciled payments in this period.
              </p>
            ) : (
              <div className="rounded-xl border bg-white divide-y overflow-hidden">
                {reconciledPayments.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-gray-900">{formatMoney(p.amount)}</span>
                        <span className={
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold " +
                          (p.method === "KBZPAY" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600")
                        }>{p.method}</span>
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                          {t("badge_received")}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-gray-400">
                        {t("label_table_prefix")} {p.session.table.label} · {fmt(p.receivedAt)}
                        {p.reference && <> · Ref: {p.reference}</>}
                      </p>
                    </div>
                    <p className="text-xs text-gray-400">{t("badge_confirmed")} {fmt(p.reconciledAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Accounts Payable ── */}
      {tab === "ap" && (
        <div className="space-y-5">
          <div className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-amber-600">
              {t("section_accruals_await")} ({accrualExpenses.length})
            </h2>
            {accrualExpenses.length === 0 ? (
              <p className="rounded-xl border bg-white px-4 py-4 text-center text-sm text-gray-400">
                {t("msg_no_accruals")}
              </p>
            ) : (
              accrualExpenses.map((e) => (
                <div key={e.id} className="rounded-xl border border-amber-100 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{formatMoney(e.amount)}</span>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                      {t("badge_accrual")}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-gray-700">{e.description}</p>
                  <p className="text-xs text-gray-400">
                    {e.category.name}{e.vendor && <> · {e.vendor}</>} · {fmtDate(e.businessDate)} · {t("label_entered_by")} {e.enteredBy.name}
                  </p>
                  <p className="mt-1 text-xs italic text-amber-600">{t("msg_accrual_hint")}</p>
                </div>
              ))
            )}
          </div>

          <div className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-red-600">
              {t("section_confirmed_pending_pay")} ({confirmedPendingExpenses.length})
            </h2>
            {confirmedPendingExpenses.length === 0 ? (
              <p className="rounded-xl border bg-white px-4 py-4 text-center text-sm text-gray-400">
                {t("msg_no_confirmed_payable")}
              </p>
            ) : (
              confirmedPendingExpenses.map((e) => (
                <div key={e.id} className="rounded-xl border border-red-100 bg-white p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-900">{formatMoney(e.amount)}</span>
                      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-700">
                        {t("label_bank_transfer")}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-gray-700">{e.description}</p>
                    <p className="text-xs text-gray-500">
                      {e.category.name}{e.vendor && <> · {e.vendor}</>} · {fmtDate(e.businessDate)}
                    </p>
                  </div>
                  <form action={markPaid}>
                    <input type="hidden" name="id" value={e.id} />
                    <button type="submit" className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 active:scale-95 transition">
                      {t("btn_paid")}
                    </button>
                  </form>
                </div>
              ))
            )}
          </div>

          <div className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              {t("section_ap_history")} ({paidExpenses.length})
            </h2>
            {paidExpenses.length === 0 ? (
              <p className="rounded-xl border bg-white px-4 py-4 text-center text-sm text-gray-400">
                No paid expenses in this period.
              </p>
            ) : (
              <div className="rounded-xl border bg-white divide-y overflow-hidden">
                {paidExpenses.map((e) => (
                  <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{formatMoney(e.amount)}</span>
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                          {t("btn_paid")}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700">{e.description}</p>
                      <p className="text-xs text-gray-400">
                        {e.category.name}{e.vendor && <> · {e.vendor}</>} · {fmtDate(e.businessDate)}
                      </p>
                    </div>
                    <p className="text-xs text-gray-400">{t("badge_confirmed")} {fmt(e.paidAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── P&L ── */}
      {tab === "pl" && (
        <div className="space-y-5">
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-green-700">{t("section_revenue")}</h2>
            <div className="space-y-1.5 text-sm">
              <PLRow label={t("label_cash_sales")} value={revenue.cash}  color="text-gray-700" />
              <PLRow label="KBZPay"                value={revenue.kbz}   color="text-gray-700" />
              <PLRow label={t("label_other")}      value={revenue.other} color="text-gray-700" />
              <div className="flex justify-between border-t pt-2 font-bold">
                <span>{t("row_total_revenue")}</span>
                <span className="tabular-nums text-green-700">{formatMoney(totalRevenue)}</span>
              </div>
            </div>

            {incomeByItem.size > 0 && (
              <details className="mt-4 border-t pt-3">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {t("label_income_by_item")} ({incomeByItem.size})
                </summary>
                <div className="mt-2 space-y-1 text-sm">
                  {Array.from(incomeByItem.values())
                    .sort((a, b) => b.amount - a.amount)
                    .map((row) => (
                      <div key={row.label} className="flex items-center justify-between">
                        <span className="text-gray-600">{row.label} <span className="text-xs text-gray-400">× {row.qty}</span></span>
                        <span className="tabular-nums text-gray-700">{formatMoney(row.amount)}</span>
                      </div>
                    ))}
                </div>
              </details>
            )}

            {movementRows.length > 0 && (
              <details className="mt-4 border-t pt-3">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {t("label_itemized_sessions")} ({movementRows.length})
                </summary>
                <div className="mt-2">
                  <MovementsTable
                    rows={movementRows}
                    currency="MMK"
                    totalAdults={totalAdults}
                    totalChildren={totalChildren}
                    totalRevenue={movementsRevenue}
                  />
                </div>
              </details>
            )}
          </div>

          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-red-700">{t("section_expenses_accruals")}</h2>
            {expByCat.size === 0 ? (
              <p className="text-sm text-gray-400">{t("msg_no_expenses_month")}</p>
            ) : (
              <div className="space-y-1.5 text-sm">
                {Array.from(expByCat.values())
                  .sort((a, b) => (b.confirmed + b.accrual) - (a.confirmed + a.accrual))
                  .map((row) => (
                    <div key={row.name} className="flex items-center justify-between">
                      <div>
                        <span className="text-gray-700">{row.name}</span>
                        {row.accrual > 0 && (
                          <span className="ml-2 text-[11px] text-amber-600">
                            ({formatMoney(row.accrual)} {t("label_accrual_suffix")})
                          </span>
                        )}
                      </div>
                      <span className="tabular-nums text-red-700">
                        {formatMoney(row.confirmed + row.accrual)}
                      </span>
                    </div>
                  ))}
                <div className="flex justify-between border-t pt-2 font-bold">
                  <span>{t("row_total_expenses")}</span>
                  <span className="tabular-nums text-red-700">{formatMoney(totalExpenses)}</span>
                </div>
              </div>
            )}

            {plExpenses.length > 0 && (
              <details className="mt-4 border-t pt-3">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {t("label_itemized_expenses")} ({plExpenses.length})
                </summary>
                <div className="mt-2 space-y-2 text-sm">
                  {plExpenses
                    .slice()
                    .sort((a, b) => b.businessDate.getTime() - a.businessDate.getTime())
                    .map((e) => (
                      <div key={e.id} className="flex items-start justify-between gap-2 border-b border-gray-50 pb-2 last:border-0">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-gray-700">{e.description}</span>
                            <span className="text-xs text-gray-400">({e.category.name})</span>
                            <span className={
                              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold " +
                              (e.paymentSource === "CASH_DRAWER" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700")
                            }>
                              {e.paymentSource === "CASH_DRAWER" ? t("source_cash_drawer") : t("source_bank_transfer")}
                            </span>
                            {!e.confirmedAt && (
                              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                                {t("badge_accrual")}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400">
                            {e.vendor && <>{e.vendor} · </>}{fmtDate(e.businessDate)}
                          </p>
                        </div>
                        <span className="flex-shrink-0 tabular-nums font-medium text-red-700">{formatMoney(e.amount)}</span>
                      </div>
                    ))}
                </div>
              </details>
            )}
          </div>

          <div className={
            "rounded-xl border p-5 shadow-sm " +
            (netPL >= 0 ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50")
          }>
            <div className="flex items-center justify-between">
              <span className="font-bold text-gray-800">{t("label_net_pl")}</span>
              <span className={
                "text-2xl font-extrabold tabular-nums " +
                (netPL >= 0 ? "text-green-700" : "text-red-700")
              }>
                {netPL >= 0 ? "+" : ""}{formatMoney(netPL)}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {t("label_pl_formula", { rev: formatMoney(totalRevenue), exp: formatMoney(totalExpenses) })}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function PLRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={`tabular-nums ${color}`}>{formatMoney(value)}</span>
    </div>
  );
}
