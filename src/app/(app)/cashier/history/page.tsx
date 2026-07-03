import Link from "next/link";
import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { formatMoney, formatTime, formatDate } from "@/lib/format";
import { mmToday, mmDayRange } from "@/lib/business-day";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

export default async function CashierHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await requireAnyRole(["CASHIER", "MANAGER", "ADMIN"]);
  const { date } = await searchParams;
  const settings = await getSettings();
  const c = settings.currency;
  const t = await getT();

  // Default to today (Myanmar calendar day)
  const todayStr = mmToday();
  const selectedDate = date ?? todayStr;
  const { start: dayStart, end: dayEnd } = mmDayRange(selectedDate);

  const sessions = await prisma.tableSession.findMany({
    where: {
      status: "CLOSED",
      closedAt: { gte: dayStart, lt: dayEnd },
    },
    include: {
      table: { select: { label: true } },
      openedBy: { select: { name: true } },
      closedBy: { select: { name: true } },
      payments: { select: { method: true, amount: true } },
      mergedTables: { include: { table: { select: { label: true } } } },
    },
    orderBy: { closedAt: "asc" },
  });

  // Compute per-session payment breakdown, deducting change from cash to show net revenue
  const rows = sessions.map((s) => {
    const cashPaid = s.payments.filter((p) => p.method === "CASH").reduce((sum, p) => sum + p.amount, 0);
    const kbz = s.payments.filter((p) => p.method === "KBZPAY").reduce((sum, p) => sum + p.amount, 0);
    const other = s.payments.filter((p) => p.method === "OTHER").reduce((sum, p) => sum + p.amount, 0);
    const totalPaid = cashPaid + kbz + other;
    const cashChange = cashPaid > 0 ? Math.max(0, totalPaid - (s.billTotal ?? totalPaid)) : 0;
    const cash = cashPaid - cashChange;
    const total = cash + kbz + other;
    const tableLabel = [s.table.label, ...s.mergedTables.map((m) => m.table.label)].join(" + ");
    return { session: s, cash, kbz, other, total, tableLabel };
  });

  const grandCash = rows.reduce((sum, r) => sum + r.cash, 0);
  const grandKbz = rows.reduce((sum, r) => sum + r.kbz, 0);
  const grandOther = rows.reduce((sum, r) => sum + r.other, 0);
  const grandTotal = grandCash + grandKbz + grandOther;
  const totalPax = sessions.reduce((sum, s) => sum + s.adults + s.children, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/cashier" className="text-sm text-brand hover:underline">← {t("nav_cashier")}</Link>
        <h1 className="text-xl font-bold">{t("heading_history")}</h1>
      </div>

      {/* Date picker */}
      <form method="GET" className="flex items-center gap-2">
        <label className="text-sm text-gray-600">{t("label_date")}</label>
        <input
          type="date"
          name="date"
          defaultValue={selectedDate}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
        >
          {t("btn_view")}
        </button>
      </form>

      {/* Summary bar */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label={t("stat_sessions")} value={String(rows.length)} />
          <SummaryCard label={t("stat_total_pax")} value={String(totalPax)} />
          <SummaryCard label={t("payment_method_cash")} value={formatMoney(grandCash, c)} />
          <SummaryCard label={t("label_total_shift_takings")} value={formatMoney(grandTotal, c)} highlight />
        </div>
      )}

      {/* Session table */}
      {rows.length === 0 ? (
        <div className="rounded-xl bg-white p-8 text-center text-sm text-gray-400 shadow-sm">
          {t("empty_no_history")}
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-2 sm:hidden">
            {rows.map((r) => (
              <Link
                key={r.session.id}
                href={`/cashier/checkout/${r.session.id}`}
                className="block rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-brand"
              >
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold">{r.tableLabel}</span>
                  <span className="text-lg font-extrabold text-brand tabular-nums">{formatMoney(r.total, c)}</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
                  <span>{r.session.adults + r.session.children} pax</span>
                  <span>·</span>
                  <span>{formatTime(r.session.openedAt)} → {r.session.closedAt ? formatTime(r.session.closedAt) : "—"}</span>
                </div>
                <div className="mt-1.5 flex gap-3 text-xs text-gray-500">
                  {r.cash > 0 && <span>{t("payment_method_cash")}: {formatMoney(r.cash, c)}</span>}
                  {r.kbz > 0 && <span>KBZPay: {formatMoney(r.kbz, c)}</span>}
                  {r.other > 0 && <span>{t("payment_method_other")}: {formatMoney(r.other, c)}</span>}
                </div>
              </Link>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-xl bg-white shadow-sm sm:block">
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2">{t("col_table")}</th>
                  <th className="px-4 py-2">{t("col_opened")}</th>
                  <th className="px-4 py-2">{t("col_closed")}</th>
                  <th className="px-4 py-2 text-right">Pax</th>
                  <th className="px-4 py-2 text-right">{t("payment_method_cash")}</th>
                  <th className="px-4 py-2 text-right">KBZPay</th>
                  <th className="px-4 py-2 text-right">{t("payment_method_other")}</th>
                  <th className="px-4 py-2 text-right">{t("col_total")}</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.session.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-semibold">{r.tableLabel}</td>
                    <td className="px-4 py-2.5 text-gray-500 tabular-nums">{formatTime(r.session.openedAt)}</td>
                    <td className="px-4 py-2.5 text-gray-500 tabular-nums">
                      {r.session.closedAt ? formatTime(r.session.closedAt) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.session.adults + r.session.children}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.cash > 0 ? formatMoney(r.cash, c) : "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.kbz > 0 ? formatMoney(r.kbz, c) : "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.other > 0 ? formatMoney(r.other, c) : "—"}</td>
                    <td className="px-4 py-2.5 text-right font-bold tabular-nums text-brand">{formatMoney(r.total, c)}</td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/cashier/checkout/${r.session.id}`}
                        className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                      >
                        {t("btn_receipt")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                <tr>
                  <td className="px-4 py-2.5" colSpan={3}>{t("label_daily_total")} ({rows.length} {t("stat_sessions")})</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{totalPax}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(grandCash, c)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(grandKbz, c)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(grandOther, c)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-brand">{formatMoney(grandTotal, c)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-4 shadow-sm ${highlight ? "bg-brand text-white" : "bg-white border border-gray-200"}`}>
      <div className={`text-xs uppercase tracking-wide ${highlight ? "opacity-80" : "text-gray-500"}`}>{label}</div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${highlight ? "" : "text-gray-800"}`}>{value}</div>
    </div>
  );
}
