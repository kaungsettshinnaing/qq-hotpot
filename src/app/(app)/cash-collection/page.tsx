import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getCashStanding, createCashMovement, computeShiftTotals } from "@/lib/shift";
import { formatMoney, formatDateTime, formatTime } from "@/lib/format";
import { mmToday, mmDayOf, mmDayRange } from "@/lib/business-day";
import { revalidatePath } from "next/cache";
import CollectionCard from "./CollectionCard";

export const dynamic = "force-dynamic";

async function recordCollection(fd: FormData) {
  "use server";
  const user = await requireAnyRole(["ADMIN"]);
  const type = fd.get("type") as "COLLECT" | "INJECT";
  const amount = Math.round(Math.abs(Number(fd.get("amount")) || 0));
  const note = (fd.get("note") as string | null)?.trim() || null;
  if (!amount || !["COLLECT", "INJECT"].includes(type)) return;
  // Auto-tags whichever shift is open, so this stays consistent with that
  // shift's expected-cash total instead of only affecting the standalone standing.
  await createCashMovement(type, amount, note, user.id);
  revalidatePath("/cash-collection");
  revalidatePath("/cashier");
  revalidatePath("/cashier/shift");
  revalidatePath("/reports");
}

function fmtDate(d: Date) {
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export default async function CashCollectionPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireAnyRole(["ADMIN"]);
  const settings = await getSettings();
  const c = settings.currency;

  const sp = await searchParams;
  const todayStr = mmToday();
  const defaultFrom = new Date(mmDayRange(todayStr).start.getTime() - 13 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
  const fromStr = sp.from ?? defaultFrom;
  const toStr = sp.to ?? todayStr;
  const rangeStart = mmDayRange(fromStr).start;
  const rangeEnd = mmDayRange(toStr).end;

  const [cashStanding, lastShift, recent, rangeShifts] = await Promise.all([
    getCashStanding(),
    prisma.cashierShift.findFirst({
      where: { status: "CLOSED" },
      orderBy: { closedAt: "desc" },
      select: { closedAt: true, countedCash: true },
    }),
    prisma.cashCollection.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { recordedBy: { select: { name: true } } },
    }),
    prisma.cashierShift.findMany({
      where: { openedAt: { gte: rangeStart, lt: rangeEnd } },
      orderBy: { openedAt: "asc" },
      include: { cashier: { select: { name: true } } },
    }),
  ]);

  // Per-shift cash sales/expenses (change-deducted, matches shift close reconciliation).
  const shiftTotals = new Map(
    await Promise.all(
      rangeShifts.map(async (s) => [
        s.id,
        await computeShiftTotals(s.id, s.openingFloat, { openedAt: s.openedAt, closedAt: s.closedAt }),
      ] as const),
    ),
  );

  // Group shifts by the Myanmar business day they opened on — a shift that
  // spans midnight is attributed to the day it started, same convention as
  // attendance/business-day grouping elsewhere in the app.
  const dayMap = new Map<string, typeof rangeShifts>();
  for (const s of rangeShifts) {
    const key = mmDayOf(s.openedAt).toISOString().slice(0, 10);
    const group = dayMap.get(key) ?? [];
    group.push(s);
    dayMap.set(key, group);
  }
  const dailyCash = Array.from(dayMap.entries())
    .map(([day, shifts]) => {
      const first = shifts[0];
      const last = shifts[shifts.length - 1];
      const cashIncome = shifts.reduce((sum, s) => sum + (shiftTotals.get(s.id)?.cashSales ?? 0), 0);
      const cashExpense = shifts.reduce((sum, s) => sum + (shiftTotals.get(s.id)?.cashExpenses ?? 0), 0);
      return {
        day,
        shiftCount: shifts.length,
        startCash: first.openingFloat,
        startTime: first.openedAt,
        endCash: last.status === "CLOSED" ? last.countedCash : null,
        endTime: last.closedAt,
        endInProgress: last.status !== "CLOSED",
        lastCashier: last.cashier.name,
        cashIncome,
        cashExpense,
      };
    })
    .sort((a, b) => (a.day < b.day ? 1 : -1));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Cash Collection</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Record cash taken from or added to the drawer. The cashier&apos;s opening float is auto-calculated from this ledger.
        </p>
        <p className="mt-1 text-xs text-amber-600">
          Only record money that physically moves right now. To leave a float for tomorrow, collect just the
          excess — do not inject tomorrow&apos;s float in advance.
        </p>
      </div>

      {/* Cash standing card */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="sm:col-span-1 rounded-xl bg-brand p-5 text-white shadow-sm">
          <div className="text-xs uppercase tracking-wide opacity-70">Current cash standing</div>
          <div className="mt-1 text-3xl font-bold tabular-nums">{formatMoney(cashStanding, c)}</div>
          {lastShift?.closedAt && (
            <div className="mt-2 text-xs opacity-60">
              Based on last shift closed {fmtDate(lastShift.closedAt)}
              {lastShift.countedCash != null && (
                <span> ({formatMoney(lastShift.countedCash, c)} counted)</span>
              )}
            </div>
          )}
          {!lastShift && (
            <div className="mt-2 text-xs opacity-60">No closed shifts yet — based on injections only</div>
          )}
        </div>

        <CollectionCard type="COLLECT" standing={cashStanding} currency={c} action={recordCollection} />
        <CollectionCard type="INJECT" standing={cashStanding} currency={c} action={recordCollection} />
      </div>

      {/* Daily cash report */}
      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Daily cash on hand
          </h2>
          <form method="GET" className="flex items-center gap-2">
            <input
              type="date"
              name="from"
              defaultValue={fromStr}
              className="rounded-lg border border-gray-300 px-2 py-1 text-xs"
            />
            <span className="text-xs text-gray-400">→</span>
            <input
              type="date"
              name="to"
              defaultValue={toStr}
              className="rounded-lg border border-gray-300 px-2 py-1 text-xs"
            />
            <button className="rounded-lg bg-gray-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-gray-900">
              Apply
            </button>
          </form>
        </div>
        <p className="mb-2 text-xs text-gray-400">
          Start = opening float of the first shift that day. End = counted cash at the close of the last shift
          that day (a shift spanning midnight counts toward the day it opened).
        </p>

        {dailyCash.length === 0 ? (
          <p className="rounded-xl border bg-white px-4 py-6 text-center text-sm text-gray-400">
            No shifts opened in this range.
          </p>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="space-y-2 sm:hidden">
              {dailyCash.map((d) => (
                <div key={d.day} className="rounded-xl border bg-white p-3.5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{fmtDate(new Date(d.day))}</span>
                    <span className="text-xs text-gray-400">{d.shiftCount} shift{d.shiftCount > 1 ? "s" : ""}</span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-sm">
                    <span className="text-gray-500">Start ({formatTime(d.startTime)})</span>
                    <span className="tabular-nums font-medium">{formatMoney(d.startCash, c)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between text-sm">
                    <span className="text-gray-500">Cash income</span>
                    <span className="tabular-nums font-medium text-emerald-600">+{formatMoney(d.cashIncome, c)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between text-sm">
                    <span className="text-gray-500">Cash expense</span>
                    <span className="tabular-nums font-medium text-red-500">−{formatMoney(d.cashExpense, c)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between text-sm">
                    <span className="text-gray-500">
                      End{d.endTime ? ` (${formatTime(d.endTime)})` : ""}
                    </span>
                    <span className="tabular-nums font-medium">
                      {d.endInProgress ? (
                        <span className="text-amber-600">shift in progress</span>
                      ) : (
                        formatMoney(d.endCash ?? 0, c)
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto rounded-xl bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-gray-400 border-b">
                  <tr>
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2 text-right">Shifts</th>
                    <th className="px-4 py-2 text-right">Start of day (time)</th>
                    <th className="px-4 py-2 text-right">Cash at start</th>
                    <th className="px-4 py-2 text-right">Cash income</th>
                    <th className="px-4 py-2 text-right">Cash expense</th>
                    <th className="px-4 py-2 text-right">End of day (time)</th>
                    <th className="px-4 py-2 text-right">Cash at end</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {dailyCash.map((d) => (
                    <tr key={d.day}>
                      <td className="px-4 py-2.5 font-medium">{fmtDate(new Date(d.day))}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{d.shiftCount}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{formatTime(d.startTime)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium">{formatMoney(d.startCash, c)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium text-emerald-600">
                        +{formatMoney(d.cashIncome, c)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium text-red-500">
                        −{formatMoney(d.cashExpense, c)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">
                        {d.endTime ? formatTime(d.endTime) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                        {d.endInProgress ? (
                          <span className="text-amber-600">in progress</span>
                        ) : (
                          formatMoney(d.endCash ?? 0, c)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* History */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Collection history
        </h2>

        {/* Mobile cards */}
        <div className="space-y-2 sm:hidden">
          {recent.length === 0 && (
            <p className="text-sm text-gray-400">No records yet.</p>
          )}
          {recent.map((r) => (
            <div
              key={r.id}
              className={`rounded-xl border bg-white p-3.5 shadow-sm flex items-center justify-between ${
                r.type === "COLLECT" ? "border-red-100" : "border-green-100"
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    r.type === "COLLECT"
                      ? "bg-red-100 text-red-700"
                      : "bg-green-100 text-green-700"
                  }`}>
                    {r.type === "COLLECT" ? "↓ Collect" : "↑ Inject"}
                  </span>
                  <span className="text-xs text-gray-400">{r.recordedBy.name}</span>
                </div>
                <div className="mt-0.5 text-xs text-gray-400">
                  {formatDateTime(r.createdAt)}
                  {r.note && <span className="ml-1">· {r.note}</span>}
                </div>
              </div>
              <div className={`text-lg font-bold tabular-nums ${
                r.type === "COLLECT" ? "text-red-600" : "text-green-600"
              }`}>
                {r.type === "COLLECT" ? "−" : "+"}{formatMoney(r.amount, c)}
              </div>
            </div>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-400 border-b">
              <tr>
                <th className="px-4 py-2">Date / Time</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Note</th>
                <th className="px-4 py-2">By</th>
                <th className="px-4 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recent.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                    No records yet.
                  </td>
                </tr>
              )}
              {recent.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5 text-gray-500">{formatDateTime(r.createdAt)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      r.type === "COLLECT"
                        ? "bg-red-100 text-red-700"
                        : "bg-green-100 text-green-700"
                    }`}>
                      {r.type === "COLLECT" ? "↓ Collect" : "↑ Inject"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">{r.note ?? "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600">{r.recordedBy.name}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${
                    r.type === "COLLECT" ? "text-red-600" : "text-green-600"
                  }`}>
                    {r.type === "COLLECT" ? "−" : "+"}{formatMoney(r.amount, c)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
