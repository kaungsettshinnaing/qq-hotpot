import Link from "next/link";
import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getOpenShift, getAnyOpenShift, computeShiftTotals } from "@/lib/shift";
import { formatMoney, formatDateTime } from "@/lib/format";
import SubmitButton from "@/components/SubmitButton";
import { closeShift } from "../actions";
import { getT } from "@/lib/lang";
import CountedCashInput from "./CountedCashInput";

export const dynamic = "force-dynamic";

export default async function ShiftPage() {
  const user = await requireAnyRole(["CASHIER", "MANAGER", "ADMIN"]);
  const settings = await getSettings();
  const c = settings.currency;
  const t = await getT();

  const shift = await getOpenShift(user.id);
  const totals = shift
    ? await computeShiftTotals(shift.id, shift.openingFloat, { openedAt: shift.openedAt, closedAt: null })
    : null;
  const anyOpen = shift ? null : await getAnyOpenShift();
  const otherShift = anyOpen?.cashierId !== user.id ? anyOpen : null;

  const recent = await prisma.cashierShift.findMany({
    where: { cashierId: user.id, status: "CLOSED" },
    orderBy: { closedAt: "desc" },
    take: 10,
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/cashier" className="text-sm text-brand hover:underline">← {t("nav_cashier")}</Link>
        <h1 className="text-xl font-bold">{t("heading_shift_reconciliation")}</h1>
      </div>

      {!shift && otherShift ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-5 space-y-1">
          <p className="text-sm font-bold text-red-800">{t("shift_handover_title")}</p>
          <p className="text-sm text-red-700">
            {t("shift_handover_body", {
              name: otherShift.cashier.name,
              time: otherShift.openedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            })}
          </p>
          <p className="text-xs text-red-500">{t("shift_handover_hint")}</p>
          <Link href="/cashier" className="mt-2 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">
            ← {t("nav_cashier")}
          </Link>
        </div>
      ) : !shift ? (
        <div className="rounded-xl bg-white p-5 shadow-sm text-center py-10">
          <p className="text-gray-500 text-sm">{t("warning_no_shift")}</p>
          <Link href="/cashier" className="mt-3 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">
            ← {t("nav_cashier")}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="rounded-xl bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">{t("section_current_shift")}</h3>
              <span className="text-xs text-gray-400">{t("label_opened")} {formatDateTime(shift.openedAt)}</span>
            </div>
            <div className="space-y-1.5 text-sm">
              <Row label={t("row_start_balance")} value={formatMoney(shift.openingFloat, c)} />
              <Row label={t("row_cash_sales")} value={formatMoney(totals!.cashSales, c)} />
              <Row label={t("row_cash_expenses")} value={formatMoney(totals!.cashExpenses, c)} />
              {totals!.cashInjected > 0 && (
                <Row label={t("row_cash_injected")} value={formatMoney(totals!.cashInjected, c)} />
              )}
              {totals!.cashWithdrawn > 0 && (
                <Row label={t("row_cash_withdrawn")} value={formatMoney(totals!.cashWithdrawn, c)} />
              )}
              <div className="flex justify-between border-t border-gray-200 pt-2 font-bold">
                <span>{t("row_expected_in_drawer")}</span>
                <span className="tabular-nums text-brand">{formatMoney(totals!.expected, c)}</span>
              </div>
            </div>
            <form action={closeShift} className="mt-5 space-y-2">
              <CountedCashInput
                expected={totals!.expected}
                currency={c}
                label={t("label_counted_cash")}
                matchLabel={t("label_counted_cash_match")}
                discrepancyWarning={t("warning_cash_discrepancy")}
              />
              <SubmitButton
                className="w-full rounded-lg bg-gray-800 py-2.5 font-semibold text-white hover:bg-gray-900 disabled:opacity-60"
                pendingText={t("pending_closing")}
              >
                {t("btn_close_shift")}
              </SubmitButton>
              <p className="text-[11px] text-gray-400">{t("shift_variance_note")}</p>
            </form>
          </section>

          <section className="rounded-xl bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-700">{t("section_digital_payments")}</h3>
            <div className="space-y-1.5 text-sm">
              <Row label="KBZPay" value={formatMoney(totals!.kbzSales, c)} />
              <Row label={t("payment_method_other")} value={formatMoney(totals!.otherSales, c)} />
              <div className="flex justify-between border-t border-gray-200 pt-2 font-semibold">
                <span>{t("label_total_digital")}</span>
                <span className="tabular-nums">{formatMoney(totals!.kbzSales + totals!.otherSales, c)}</span>
              </div>
            </div>
            <div className="mt-4 rounded-lg bg-gray-50 border border-gray-100 p-3 text-xs text-gray-500">
              <div className="flex justify-between font-semibold text-gray-700 text-sm mb-1.5">
                <span>{t("label_total_shift_takings")}</span>
                <span className="tabular-nums">{formatMoney(totals!.cashSales + totals!.kbzSales + totals!.otherSales, c)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t("payment_method_cash")}</span><span className="tabular-nums">{formatMoney(totals!.cashSales, c)}</span>
              </div>
              <div className="flex justify-between">
                <span>KBZPay</span><span className="tabular-nums">{formatMoney(totals!.kbzSales, c)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t("payment_method_other")}</span><span className="tabular-nums">{formatMoney(totals!.otherSales, c)}</span>
              </div>
            </div>
          </section>
        </div>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          {t("section_recent_closed_shifts")}
        </h2>
        {recent.length === 0 ? (
          <p className="text-sm text-gray-400">{t("empty_no_closed_shifts")}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-gray-400 border-b">
                <tr>
                  <th className="px-4 py-2">{t("col_opened")}</th>
                  <th className="px-4 py-2">{t("col_closed")}</th>
                  <th className="px-4 py-2 text-right">{t("col_float")}</th>
                  <th className="px-4 py-2 text-right">{t("col_expected")}</th>
                  <th className="px-4 py-2 text-right">{t("col_counted")}</th>
                  <th className="px-4 py-2 text-right">{t("col_variance")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recent.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-2.5">{formatDateTime(s.openedAt)}</td>
                    <td className="px-4 py-2.5 text-gray-400">{s.closedAt ? formatDateTime(s.closedAt) : "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(s.openingFloat, c)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(s.expectedCash ?? 0, c)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(s.countedCash ?? 0, c)}</td>
                    <td className={"px-4 py-2.5 text-right font-semibold tabular-nums " +
                      ((s.variance ?? 0) < 0 ? "text-red-600" : (s.variance ?? 0) > 0 ? "text-amber-600" : "text-emerald-600")}>
                      {formatMoney(s.variance ?? 0, c)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-600">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
