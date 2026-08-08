import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { formatMoney } from "@/lib/format";
import { mmNow, mmDayRange, mmDayOf } from "@/lib/business-day";
import { getPLReport, emptyPLReport } from "@/lib/pl-report";
import { getT } from "@/lib/lang";
import MovementsTable from "../reports/MovementsTable";
import { postArReconciled, postApPaid } from "@/lib/journal-postings";

export const dynamic = "force-dynamic";

// ── Server actions ────────────────────────────────────────────────────────────

async function markReceived(fd: FormData) {
  "use server";
  await requireAnyRole(["ADMIN"]);
  const id = fd.get("id") as string;
  const reconciledAt = new Date();
  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.update({ where: { id }, data: { reconciledAt } });
    await postArReconciled(tx, { id: payment.id, amount: payment.amount, reconciledAt });
  });
  revalidatePath("/accounting");
}

async function markPaid(fd: FormData) {
  "use server";
  await requireAnyRole(["ADMIN"]);
  const id = fd.get("id") as string;
  const paidAt = new Date();
  await prisma.$transaction(async (tx) => {
    const expense = await tx.expense.update({ where: { id }, data: { paidAt } });
    await postApPaid(tx, { id: expense.id, amount: expense.amount, paidAt });
    // Any stock delivery logged against this expense (bank transfer, not yet
    // settled) is now actually paid — flip it so supplier-spend reports stop
    // excluding it.
    await tx.stockDelivery.updateMany({
      where: { expenseId: id, paymentStatus: "PENDING_SETTLEMENT" },
      data: { paymentStatus: "PAID" },
    });
  });
  revalidatePath("/accounting");
  revalidatePath("/inventory");
  revalidatePath("/inventory/deliveries");
  revalidatePath("/manager/inventory");
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
  const [reconciledPayments, paidExpenses, pl, journalEntries, priorLines] = await Promise.all([
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
      ? getPLReport(rangeStart, rangeEnd)
      : Promise.resolve(emptyPLReport()),
    tab === "journal"
      ? prisma.journalEntry.findMany({
          where: { date: { gte: rangeStart, lt: rangeEnd } },
          include: { lines: { include: { account: true }, orderBy: { id: "asc" } } },
          orderBy: { entryNo: "asc" },
        })
      : Promise.resolve([]),
    tab === "journal"
      ? prisma.journalLine.findMany({
          where: { entry: { date: { lt: rangeStart } } },
          select: { debit: true, credit: true, account: { select: { type: true } } },
        })
      : Promise.resolve([]),
  ]);

  const journalTotals = journalEntries.reduce(
    (acc, e) => {
      for (const l of e.lines) {
        acc.debit += l.debit;
        acc.credit += l.credit;
      }
      return acc;
    },
    { debit: 0, credit: 0 },
  );

  // Balance carried over from before the selected range — cumulative net
  // (revenue − expense) of every entry dated earlier, so the daily running
  // balance below doesn't reset to zero at an arbitrary date-picker boundary.
  const openingBalance = priorLines.reduce((sum, l) => {
    if (l.account.type === "REVENUE") return sum + (l.credit - l.debit);
    if (l.account.type === "EXPENSE") return sum - (l.debit - l.credit);
    return sum;
  }, 0);

  // Daily ins/outs — "in" = net revenue recognized that day (credits to
  // REVENUE accounts minus contra-revenue debits, e.g. Discounts &
  // Allowances), "out" = expenses recognized that day (debits to EXPENSE
  // accounts, incl. payroll). This is exactly how the period P&L above is
  // derived, just broken out per day. "In" is further broken down by which
  // asset account received the money (Cash vs Digital Wallet, etc.) and
  // "Out" by expense category, each down to the individual entries that
  // made it up — so the summary is drillable without needing the old raw
  // entry-by-entry list.
  type Breakdown = { code: string; name: string; amount: number };
  type OutCategory = Breakdown & { items: { entryNo: number; description: string; amount: number }[] };
  type DayRow = { date: Date; in: number; out: number; inByAccount: Breakdown[]; outByCategory: OutCategory[] };

  const dailyMap = new Map<string, DayRow>();
  for (const e of journalEntries) {
    const dayKey = mmDayOf(e.date).toISOString().slice(0, 10);
    const row = dailyMap.get(dayKey) ?? { date: mmDayOf(e.date), in: 0, out: 0, inByAccount: [], outByCategory: [] };

    const isRevenueEntry = e.lines.some((l) => l.account.type === "REVENUE");
    for (const l of e.lines) {
      if (l.account.type === "REVENUE") row.in += l.credit - l.debit;
      if (l.account.type === "EXPENSE") row.out += l.debit - l.credit;

      // "In" breakdown: the asset side of a revenue-recognizing entry (Cash,
      // Digital Wallet, ...) — never the revenue/discount lines themselves.
      if (isRevenueEntry && l.account.type === "ASSET" && l.debit > 0) {
        const existing = row.inByAccount.find((a) => a.code === l.account.code);
        if (existing) existing.amount += l.debit;
        else row.inByAccount.push({ code: l.account.code, name: l.account.name, amount: l.debit });
      }

      // "Out" breakdown: category (= the expense account itself) → items.
      if (l.account.type === "EXPENSE" && l.debit > 0) {
        let cat = row.outByCategory.find((c) => c.code === l.account.code);
        if (!cat) {
          cat = { code: l.account.code, name: l.account.name, amount: 0, items: [] };
          row.outByCategory.push(cat);
        }
        cat.amount += l.debit;
        cat.items.push({ entryNo: e.entryNo, description: e.description, amount: l.debit });
      }
    }
    dailyMap.set(dayKey, row);
  }
  const dailyRowsRaw = Array.from(dailyMap.values()).sort((a, b) => a.date.getTime() - b.date.getTime());

  // Running balance = opening balance + cumulative net up to and including that day.
  let runningBalance = openingBalance;
  const dailyRows = dailyRowsRaw.map((d) => {
    runningBalance += d.in - d.out;
    return { ...d, balance: runningBalance };
  });

  // ── P&L ───────────────────────────────────────────────────────────────────
  // Every figure below comes from getPLReport() — the same function backing
  // /accounting/pl/export, so the screen and the downloaded workbook can never
  // disagree.
  const {
    revenue,
    totalRevenue,
    expensesByCategory: expByCat,
    totalExpenses,
    netPL,
    sessions: movementRows,
    sessionsRevenue: movementsRevenue,
    totalAdults,
    totalChildren,
    incomeByItem,
    expenses: plExpenses,
  } = pl;

  const pendingARTotal   = pendingPayments.reduce((s, p) => s + p.amount, 0);
  const accrualTotal     = accrualExpenses.reduce((s, e) => s + e.amount, 0);
  const confirmedAPTotal = confirmedPendingExpenses.reduce((s, e) => s + e.amount, 0);

  const tabs = [
    { key: "ar", label: t("tab_ar") },
    { key: "ap", label: t("tab_ap") },
    { key: "pl", label: t("tab_pl") },
    { key: "journal", label: t("tab_journal") },
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
        <span className="text-xs font-medium text-gray-500">{t("label_date_range")}</span>
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
          {t("btn_apply")}
        </button>
        <a
          href={`/accounting?tab=${tab}&from=${defaultFrom}&to=${defaultTo}`}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          {t("link_this_month")}
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
                {t("empty_no_reconciled_payments_period")}
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
                {t("empty_no_paid_expenses_period")}
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
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">
              {fromStr} → {toStr}
            </h2>
            <a
              href={`/accounting/pl/export?from=${fromStr}&to=${toStr}`}
              className="rounded-lg bg-green-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-800"
            >
              {t("btn_export_excel")}
            </a>
          </div>

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
                    labels={{
                      colTable: t("col_table"),
                      colDiners: t("label_diners_ac"),
                      colRevenue: t("label_revenue"),
                      colStart: t("col_start"),
                      colEnd: t("label_end"),
                      empty: t("empty_no_tables_settled"),
                      emptyLineItems: t("empty_no_line_items"),
                      subtotal: t("bill_subtotal"),
                      discount: t("bill_discount"),
                      serviceCharge: t("bill_service_charge"),
                      tax: t("bill_tax"),
                      billTotal: t("label_bill_total"),
                      total: t("col_total"),
                    }}
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
                            <span className="text-xs text-gray-400">({e.categoryName})</span>
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

      {/* ── General Journal ── */}
      {tab === "journal" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">
              {t("section_journal_entries")}
            </h2>
            <a
              href={`/accounting/journal/export?from=${fromStr}&to=${toStr}`}
              className="rounded-lg bg-green-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-800"
            >
              {t("btn_export_excel")}
            </a>
          </div>

          {journalEntries.length === 0 ? (
            <p className="rounded-xl border bg-white px-4 py-6 text-center text-sm text-gray-400">
              {t("msg_no_journal_entries")}
            </p>
          ) : (
            <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
              <h3 className="border-b border-gray-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {t("section_daily_ins_outs")}
              </h3>

              <div className="grid grid-cols-[1fr,auto,auto,auto,auto] gap-x-3 border-b border-gray-100 px-4 py-2 text-xs text-gray-500">
                <span>{t("col_date_time")}</span>
                <span className="text-right w-24">{t("label_daily_in")}</span>
                <span className="text-right w-24">{t("label_daily_out")}</span>
                <span className="text-right w-24">{t("label_daily_net")}</span>
                <span className="text-right w-28">{t("label_daily_balance")}</span>
              </div>

              <div className="px-4 py-2 text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
                {t("label_balance_carried_over")} <span className="font-semibold tabular-nums text-gray-700">{formatMoney(openingBalance)}</span>
              </div>

              <div className="divide-y divide-gray-50">
                {dailyRows.map((d) => {
                  const net = d.in - d.out;
                  return (
                    <details key={d.date.toISOString()} className="group">
                      <summary className="grid grid-cols-[1fr,auto,auto,auto,auto] gap-x-3 items-center px-4 py-2 text-sm cursor-pointer hover:bg-gray-50">
                        <span className="text-gray-700">{fmtDate(d.date)}</span>
                        <span className="text-right w-24 tabular-nums text-green-700">{formatMoney(d.in)}</span>
                        <span className="text-right w-24 tabular-nums text-red-700">{formatMoney(d.out)}</span>
                        <span className={`text-right w-24 tabular-nums font-semibold ${net >= 0 ? "text-green-700" : "text-red-700"}`}>
                          {net >= 0 ? "+" : ""}{formatMoney(net)}
                        </span>
                        <span className="text-right w-28 tabular-nums text-gray-700">{formatMoney(d.balance)}</span>
                      </summary>

                      <div className="px-4 pb-3 pl-6 space-y-3 bg-gray-50/60 text-xs">
                        <div>
                          <p className="mb-1 font-semibold text-green-700">{t("label_daily_in")}</p>
                          {d.inByAccount.length === 0 ? (
                            <p className="text-gray-400">—</p>
                          ) : (
                            d.inByAccount.map((a) => (
                              <div key={a.code} className="flex items-center justify-between py-0.5">
                                <span className="text-gray-600">{a.name}</span>
                                <span className="tabular-nums text-gray-800">{formatMoney(a.amount)}</span>
                              </div>
                            ))
                          )}
                        </div>

                        <div>
                          <p className="mb-1 font-semibold text-red-700">{t("label_daily_out")}</p>
                          {d.outByCategory.length === 0 ? (
                            <p className="text-gray-400">—</p>
                          ) : (
                            d.outByCategory.map((c) => (
                              <details key={c.code} className="mb-0.5">
                                <summary className="flex cursor-pointer items-center justify-between py-0.5 text-gray-600">
                                  <span>{c.name}</span>
                                  <span className="tabular-nums text-gray-800">{formatMoney(c.amount)}</span>
                                </summary>
                                <div className="pl-4">
                                  {c.items.map((it, i) => (
                                    <div key={i} className="flex items-center justify-between py-0.5 text-[11px] text-gray-500">
                                      <span>{it.description}</span>
                                      <span className="tabular-nums">{formatMoney(it.amount)}</span>
                                    </div>
                                  ))}
                                </div>
                              </details>
                            ))
                          )}
                        </div>
                      </div>
                    </details>
                  );
                })}
              </div>

              <div className="grid grid-cols-[1fr,auto,auto,auto,auto] gap-x-3 border-t-2 border-gray-200 px-4 py-2 text-sm font-bold">
                <span>{t("row_total")}</span>
                <span className="text-right w-24 tabular-nums text-green-700">{formatMoney(dailyRows.reduce((s, d) => s + d.in, 0))}</span>
                <span className="text-right w-24 tabular-nums text-red-700">{formatMoney(dailyRows.reduce((s, d) => s + d.out, 0))}</span>
                <span className="text-right w-24 tabular-nums">{formatMoney(dailyRows.reduce((s, d) => s + (d.in - d.out), 0))}</span>
                <span className="text-right w-28 tabular-nums">{formatMoney(dailyRows.length > 0 ? dailyRows[dailyRows.length - 1].balance : openingBalance)}</span>
              </div>
            </div>
          )}

          <div className={
            "rounded-xl border p-4 shadow-sm flex items-center justify-between " +
            (journalTotals.debit === journalTotals.credit ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50")
          }>
            <span className="text-sm font-semibold text-gray-700">
              {t("label_total_debit")} {formatMoney(journalTotals.debit)} · {t("label_total_credit")} {formatMoney(journalTotals.credit)}
            </span>
            <span className={"text-xs font-bold " + (journalTotals.debit === journalTotals.credit ? "text-green-700" : "text-red-700")}>
              {journalTotals.debit === journalTotals.credit ? t("label_balanced") : t("label_unbalanced")}
            </span>
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
