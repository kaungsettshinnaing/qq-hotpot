import Link from "next/link";
import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getOpenShift, computeShiftTotals, getCashStanding } from "@/lib/shift";
import { formatMoney, formatDateTime } from "@/lib/format";
import SubmitButton from "@/components/SubmitButton";
import { openShift, closeShift } from "../actions";

export const dynamic = "force-dynamic";

export default async function ShiftPage() {
  const user = await requireAnyRole(["CASHIER", "MANAGER", "ADMIN"]);
  const settings = await getSettings();
  const c = settings.currency;

  const [shift, cashStanding] = await Promise.all([
    getOpenShift(user.id),
    getCashStanding(),
  ]);
  const totals = shift ? await computeShiftTotals(shift.id, shift.openingFloat) : null;

  const recent = await prisma.cashierShift.findMany({
    where: { cashierId: user.id, status: "CLOSED" },
    orderBy: { closedAt: "desc" },
    take: 8,
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/cashier" className="text-sm text-brand hover:underline">
          ← Cashier
        </Link>
        <h1 className="text-xl font-bold">Shift &amp; Cash Reconciliation</h1>
      </div>

      {!shift ? (
        <section className="max-w-md rounded-xl bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700">Open a shift</h3>
          <p className="mt-1 text-sm text-gray-500">
            Count the cash you start the drawer with (opening float).
          </p>

          {/* Cash standing from admin collections */}
          <div className="mt-3 flex items-center justify-between rounded-lg bg-brand/5 border border-brand/20 px-3 py-2">
            <span className="text-xs text-gray-600">Current cash standing</span>
            <span className="font-bold text-brand tabular-nums">{formatMoney(cashStanding, c)}</span>
          </div>

          <form action={openShift} className="mt-3 flex items-end gap-2">
            <label className="block flex-1">
              <span className="mb-1 block text-xs text-gray-500">
                Opening float ({c})
                {cashStanding > 0 && (
                  <span className="ml-1 text-brand"> — pre-filled from cash standing</span>
                )}
              </span>
              <input
                name="openingFloat"
                type="number"
                min={0}
                defaultValue={cashStanding}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
            <SubmitButton
              className="rounded-lg bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
              pendingText="Opening…"
            >
              Open shift
            </SubmitButton>
          </form>
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Cash reconciliation */}
          <section className="rounded-xl bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Cash drawer</h3>
              <span className="text-xs text-gray-400">opened {formatDateTime(shift.openedAt)}</span>
            </div>

            <dl className="mt-3 space-y-1 text-sm">
              <Row label="Opening float" value={formatMoney(shift.openingFloat, c)} />
              <Row label="+ Cash sales" value={formatMoney(totals!.cashSales, c)} />
              <Row label="− Cash expenses" value={formatMoney(totals!.cashExpenses, c)} />
              <div className="flex justify-between border-t border-gray-200 pt-1 font-semibold">
                <span>= Expected in drawer</span>
                <span className="tabular-nums">{formatMoney(totals!.expected, c)}</span>
              </div>
            </dl>

            <form action={closeShift} className="mt-4 space-y-2">
              <label className="block">
                <span className="mb-1 block text-xs text-gray-500">Counted cash in drawer ({c})</span>
                <input
                  name="countedCash"
                  type="number"
                  min={0}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </label>
              <SubmitButton
                className="w-full rounded-lg bg-gray-800 py-2.5 font-semibold text-white hover:bg-gray-900 disabled:opacity-60"
                pendingText="Closing…"
              >
                Close shift &amp; reconcile
              </SubmitButton>
              <p className="text-[11px] text-gray-400">
                Variance = counted − expected. A negative number means the drawer is short.
              </p>
            </form>
          </section>

          {/* Digital payment summary */}
          <section className="rounded-xl bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-700">Digital payments (not in drawer)</h3>
            <dl className="space-y-1 text-sm">
              <Row label="KBZPay" value={formatMoney(totals!.kbzSales, c)} />
              <Row label="Other" value={formatMoney(totals!.otherSales, c)} />
              <div className="flex justify-between border-t border-gray-200 pt-1 font-semibold">
                <span>Total digital</span>
                <span className="tabular-nums">
                  {formatMoney(totals!.kbzSales + totals!.otherSales, c)}
                </span>
              </div>
            </dl>

            <div className="mt-4 rounded-lg bg-gray-50 border border-gray-200 p-3 text-xs text-gray-500">
              <div className="flex justify-between font-medium text-gray-700 text-sm mb-1">
                <span>Total shift takings</span>
                <span className="tabular-nums">
                  {formatMoney(totals!.cashSales + totals!.kbzSales + totals!.otherSales, c)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Cash</span>
                <span className="tabular-nums">{formatMoney(totals!.cashSales, c)}</span>
              </div>
              <div className="flex justify-between">
                <span>KBZPay</span>
                <span className="tabular-nums">{formatMoney(totals!.kbzSales, c)}</span>
              </div>
              <div className="flex justify-between">
                <span>Other</span>
                <span className="tabular-nums">{formatMoney(totals!.otherSales, c)}</span>
              </div>
            </div>
          </section>
        </div>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Recent closed shifts
        </h2>
        {recent.length === 0 ? (
          <p className="text-sm text-gray-400">No closed shifts yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-gray-400">
                <tr>
                  <th className="px-4 py-2">Opened</th>
                  <th className="px-4 py-2">Closed</th>
                  <th className="px-4 py-2 text-right">Float</th>
                  <th className="px-4 py-2 text-right">Expected</th>
                  <th className="px-4 py-2 text-right">Counted</th>
                  <th className="px-4 py-2 text-right">Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recent.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-2">{formatDateTime(s.openedAt)}</td>
                    <td className="px-4 py-2">{s.closedAt ? formatDateTime(s.closedAt) : "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatMoney(s.openingFloat, c)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatMoney(s.expectedCash ?? 0, c)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatMoney(s.countedCash ?? 0, c)}
                    </td>
                    <td
                      className={
                        "px-4 py-2 text-right font-semibold tabular-nums " +
                        ((s.variance ?? 0) < 0
                          ? "text-red-600"
                          : (s.variance ?? 0) > 0
                            ? "text-amber-600"
                            : "text-emerald-600")
                      }
                    >
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

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={"flex justify-between " + (muted ? "text-gray-400" : "")}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
