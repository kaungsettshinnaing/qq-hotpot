import Link from "next/link";
import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOpenShift, computeShiftTotals } from "@/lib/shift";
import { getSessionDetail, type SessionDetail } from "@/lib/orders";
import { getSettings } from "@/lib/settings";
import { formatMoney, formatTime } from "@/lib/format";
import LiveRefresh from "@/components/LiveRefresh";
import SubmitButton from "@/components/SubmitButton";
import { openShift } from "./actions";

export const dynamic = "force-dynamic";

export default async function CashierHome() {
  const user = await requireAnyRole(["CASHIER", "MANAGER", "ADMIN"]);
  const settings = await getSettings();
  const c = settings.currency;

  const shift = await getOpenShift(user.id);
  const totals = shift ? await computeShiftTotals(shift.id, shift.openingFloat) : null;

  const openSessions = await prisma.tableSession.findMany({
    where: { status: "OPEN" },
    select: { id: true },
    orderBy: { openedAt: "asc" },
  });
  const details = (
    await Promise.all(openSessions.map((s) => getSessionDetail(s.id)))
  ).filter((d): d is SessionDetail => d !== null);

  const toCollect = details.reduce((s, d) => s + Math.max(0, d.balance), 0);

  return (
    <div className="space-y-5">
      <LiveRefresh room="floor" events={["table:update"]} seconds={10} />

      {/* ── No shift — start one ── */}
      {!shift && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
          <p className="text-sm font-semibold text-amber-800">No active shift</p>
          <p className="mt-0.5 text-xs text-amber-700">
            Start a shift to enable cash tracking. The opening balance is auto-set from the current cash standing.
          </p>
          <form action={openShift} className="mt-3">
            <SubmitButton
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
              pendingText="Starting…"
            >
              Start shift
            </SubmitButton>
          </form>
        </div>
      )}

      {shift && (
        <>
          {/* ── Today's Sales ── */}
          <section className="rounded-xl bg-brand p-5 text-white shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide opacity-70">Today&apos;s sales</div>
                <div className="mt-0.5 text-3xl font-extrabold tabular-nums">
                  {formatMoney((totals?.cashSales ?? 0) + (totals?.kbzSales ?? 0) + (totals?.otherSales ?? 0), c)}
                </div>
              </div>
              <div className="text-xs opacity-60 text-right">
                shift since {formatTime(shift.openedAt)}
              </div>
            </div>

            {/* Payment method breakdown */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-white/10 px-3 py-2">
                <div className="text-[10px] uppercase opacity-70">Cash</div>
                <div className="text-base font-bold tabular-nums">{formatMoney(totals?.cashSales ?? 0, c)}</div>
              </div>
              <div className="rounded-lg bg-white/10 px-3 py-2">
                <div className="text-[10px] uppercase opacity-70">KBZPay</div>
                <div className="text-base font-bold tabular-nums">{formatMoney(totals?.kbzSales ?? 0, c)}</div>
              </div>
              <div className="rounded-lg bg-white/10 px-3 py-2">
                <div className="text-[10px] uppercase opacity-70">Other</div>
                <div className="text-base font-bold tabular-nums">{formatMoney(totals?.otherSales ?? 0, c)}</div>
              </div>
            </div>
          </section>

          {/* ── Cash in Drawer ── */}
          <section className="rounded-xl bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-700">Cash in drawer</h3>
            <div className="space-y-1.5 text-sm">
              <CashRow label="Start balance" value={formatMoney(shift.openingFloat, c)} />
              <CashRow label="+ Cash sales" value={formatMoney(totals?.cashSales ?? 0, c)} positive />
              <CashRow label="− Supplier payments (cash)" value={formatMoney(totals?.cashExpenses ?? 0, c)} negative />
              <div className="flex items-center justify-between border-t border-gray-200 pt-2 font-bold">
                <span>= Expected in drawer</span>
                <span className="tabular-nums text-brand">{formatMoney(totals?.expected ?? 0, c)}</span>
              </div>
            </div>
          </section>
        </>
      )}

      {/* ── Quick nav ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <NavCard href="/cashier/tables" icon="🪑" label="Tables" />
        <NavCard href="/cashier/expenses" icon="🧾" label="Expenses" />
        {shift ? (
          <Link
            href="/cashier/shift"
            className="rounded-xl border-2 border-brand bg-white p-4 shadow-sm transition hover:shadow"
          >
            <div className="text-2xl">💰</div>
            <div className="mt-1 text-sm font-semibold text-brand">Close Shift</div>
          </Link>
        ) : (
          <NavCard href="/cashier/shift" icon="💰" label="Shift History" />
        )}
        <div className="rounded-xl bg-brand p-4 text-white">
          <div className="text-xs uppercase opacity-80">To collect</div>
          <div className="text-xl font-bold tabular-nums">{formatMoney(toCollect, c)}</div>
        </div>
      </div>

      {/* ── Open tables ── */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Open tables ({details.length})
        </h2>
        {details.length === 0 ? (
          <p className="text-sm text-gray-400">No open tables right now.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {details.map((d) => (
              <Link
                key={d.session.id}
                href={`/cashier/checkout/${d.session.id}`}
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-brand hover:shadow active:scale-[0.98]"
              >
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold">
                    {[d.session.table.label, ...d.session.mergedTables.map((m) => m.table.label)].join(" + ")}
                  </span>
                  <span className="text-xs text-gray-400">{d.diners} pax</span>
                </div>
                <div className="mt-2 text-2xl font-extrabold text-brand">
                  {formatMoney(d.bill.total, c)}
                </div>
                {d.paid > 0 && (
                  <div className="text-xs text-gray-500">
                    paid {formatMoney(d.paid, c)} · balance {formatMoney(d.balance, c)}
                  </div>
                )}
                <div className="mt-1 text-xs text-gray-400">opened {formatTime(d.session.openedAt)}</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CashRow({ label, value, positive, negative }: {
  label: string;
  value: string;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={negative ? "text-gray-500" : positive ? "text-gray-700" : "text-gray-600"}>
        {label}
      </span>
      <span className={
        "tabular-nums font-medium " +
        (positive ? "text-emerald-600" : negative ? "text-red-500" : "text-gray-700")
      }>
        {value}
      </span>
    </div>
  );
}

function NavCard({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-brand hover:shadow active:scale-[0.98]"
    >
      <div className="text-2xl">{icon}</div>
      <div className="mt-1 text-sm font-semibold text-gray-700">{label}</div>
    </Link>
  );
}
