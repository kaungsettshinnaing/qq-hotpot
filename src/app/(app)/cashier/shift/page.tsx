import Link from "next/link";
import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getOpenShift, computeShiftTotals } from "@/lib/shift";
import { formatMoney, formatDateTime } from "@/lib/format";
import SubmitButton from "@/components/SubmitButton";
import { closeShift } from "../actions";

export const dynamic = "force-dynamic";

export default async function ShiftPage() {
  const user = await requireAnyRole(["CASHIER", "MANAGER", "ADMIN"]);
  const settings = await getSettings();
  const c = settings.currency;

  const shift = await getOpenShift(user.id);
  const totals = shift ? await computeShiftTotals(shift.id, shift.openingFloat) : null;

  const recent = await prisma.cashierShift.findMany({
    where: { cashierId: user.id, status: "CLOSED" },
    orderBy: { closedAt: "desc" },
    take: 10,
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/cashier" className="text-sm text-brand hover:underline">← Cashier</Link>
        <h1 className="text-xl font-bold">Shift &amp; Reconciliation</h1>
      </div>

      {!shift ? (
        <div className="rounded-xl bg-white p-5 shadow-sm text-center py-10">
          <p className="text-gray-500 text-sm">No active shift. Start one from the cashier home.</p>
          <Link href="/cashier" className="mt-3 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">
            ← Back to Cashier
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Cash reconciliation & close */}
          <section className="rounded-xl bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">Cash reconciliation</h3>
              <span className="text-xs text-gray-400">opened {formatDateTime(shift.openedAt)}</span>
            </div>

            <div className="space-y-1.5 text-sm">
              <Row label="Start balance" value={formatMoney(shift.openingFloat, c)} />
              <Row label="+ Cash sales" value={formatMoney(totals!.cashSales, c)} />
              <Row label="− Supplier payments (cash)" value={formatMoney(totals!.cashExpenses, c)} />
              <div className="flex justify-between border-t border-gray-200 pt-2 font-bold">
                <span>= Expected in drawer</span>
                <span className="tabular-nums text-brand">{formatMoney(totals!.expected, c)}</span>
              </div>
            </div>

            <form action={closeShift} className="mt-5 space-y-2">
              <label className="block">
                <span className="mb-1 block text-xs text-gray-500">
                  Counted cash in drawer ({c})
                </span>
                <input
                  name="countedCash"
                  type="number"
                  min={0}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-lg"
                />
              </label>
              <SubmitButton
                className="w-full rounded-lg bg-gray-800 py-2.5 font-semibold text-white hover:bg-gray-900 disabled:opacity-60"
                pendingText="Closing…"
              >
                Close shift &amp; reconcile
              </SubmitButton>
              <p className="text-[11px] text-gray-400">
                Variance = counted − expected. Negative = drawer is short.
              </p>
            </form>
          </section>

          {/* Digital payments */}
          <section className="rounded-xl bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-700">Digital payments (not in drawer)</h3>
            <div className="space-y-1.5 text-sm">
              <Row label="KBZPay" value={formatMoney(totals!.kbzSales, c)} />
              <Row label="Other" value={formatMoney(totals!.otherSales, c)} />
              <div className="flex justify-between border-t border-gray-200 pt-2 font-semibold">
                <span>Total digital</span>
                <span className="tabular-nums">
                  {formatMoney(totals!.kbzSales + totals!.otherSales, c)}
                </span>
              </div>
            </div>

            <div className="mt-4 rounded-lg bg-gray-50 border border-gray-100 p-3 text-xs text-gray-500">
              <div className="flex justify-between font-semibold text-gray-700 text-sm mb-1.5">
                <span>Total shift takings</span>
                <span className="tabular-nums">
                  {formatMoney(totals!.cashSales + totals!.kbzSales + totals!.otherSales, c)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Cash</span><span className="tabular-nums">{formatMoney(totals!.cashSales, c)}</span>
              </div>
              <div className="flex justify-between">
                <span>KBZPay</span><span className="tabular-nums">{formatMoney(totals!.kbzSales, c)}</span>
              </div>
              <div className="flex justify-between">
                <span>Other</span><span className="tabular-nums">{formatMoney(totals!.otherSales, c)}</span>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Shift history */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Shift history
        </h2>
        {recent.length === 0 ? (
          <p className="text-sm text-gray-400">No closed shifts yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-gray-400 border-b">
                <tr>
                  <th className="px-4 py-2">Opened</th>
                  <th className="px-4 py-2">Closed</th>
                  <th className="px-4 py-2 text-right">Start</th>
                  <th className="px-4 py-2 text-right">Expected</th>
                  <th className="px-4 py-2 text-right">Counted</th>
                  <th className="px-4 py-2 text-right">Variance</th>
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
                    <td className={
                      "px-4 py-2.5 text-right font-semibold tabular-nums " +
                      ((s.variance ?? 0) < 0 ? "text-red-600" : (s.variance ?? 0) > 0 ? "text-amber-600" : "text-emerald-600")
                    }>
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
