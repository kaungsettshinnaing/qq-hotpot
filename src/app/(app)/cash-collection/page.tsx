import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getCashStanding } from "@/lib/shift";
import { formatMoney, formatDateTime } from "@/lib/format";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

async function recordCollection(fd: FormData) {
  "use server";
  const user = await requireAnyRole(["ADMIN"]);
  const type = fd.get("type") as "COLLECT" | "INJECT";
  const amount = Math.round(Math.abs(Number(fd.get("amount")) || 0));
  const note = (fd.get("note") as string | null)?.trim() || null;
  if (!amount || !["COLLECT", "INJECT"].includes(type)) return;
  await prisma.cashCollection.create({
    data: { type, amount, note, recordedById: user.id },
  });
  revalidatePath("/cash-collection");
  revalidatePath("/cashier/shift");
}

function fmtDate(d: Date) {
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export default async function CashCollectionPage() {
  await requireAnyRole(["ADMIN"]);
  const settings = await getSettings();
  const c = settings.currency;

  const [cashStanding, lastShift, recent] = await Promise.all([
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
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Cash Collection</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Record cash taken from or added to the drawer. The cashier&apos;s opening float is auto-calculated from this ledger.
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

        {/* Collect form */}
        <div className="rounded-xl border-2 border-red-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-red-700">Collect cash from drawer</h3>
          <form action={recordCollection} className="space-y-2">
            <input type="hidden" name="type" value="COLLECT" />
            <label className="block">
              <span className="mb-1 block text-xs text-gray-500">Amount ({c})</span>
              <input
                name="amount"
                type="number"
                min={1}
                required
                placeholder="0"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-lg font-semibold"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-gray-500">Note (optional)</span>
              <input
                name="note"
                type="text"
                placeholder="e.g. Daily banking run"
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
            <button
              type="submit"
              className="w-full rounded-xl bg-red-600 py-2.5 font-semibold text-white hover:bg-red-700 active:scale-95 transition"
            >
              ↓ Collect — deduct from standing
            </button>
          </form>
        </div>

        {/* Inject form */}
        <div className="rounded-xl border-2 border-green-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-green-700">Inject cash into drawer</h3>
          <form action={recordCollection} className="space-y-2">
            <input type="hidden" name="type" value="INJECT" />
            <label className="block">
              <span className="mb-1 block text-xs text-gray-500">Amount ({c})</span>
              <input
                name="amount"
                type="number"
                min={1}
                required
                placeholder="0"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-lg font-semibold"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-gray-500">Note (optional)</span>
              <input
                name="note"
                type="text"
                placeholder="e.g. Float top-up"
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
            <button
              type="submit"
              className="w-full rounded-xl bg-green-600 py-2.5 font-semibold text-white hover:bg-green-700 active:scale-95 transition"
            >
              ↑ Inject — add to standing
            </button>
          </form>
        </div>
      </div>

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
