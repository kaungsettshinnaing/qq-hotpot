import Link from "next/link";
import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOpenShift } from "@/lib/shift";
import { getSessionDetail, type SessionDetail } from "@/lib/orders";
import { formatMoney, formatTime } from "@/lib/format";
import LiveRefresh from "@/components/LiveRefresh";

export const dynamic = "force-dynamic";

export default async function CashierHome() {
  const user = await requireAnyRole(["CASHIER", "MANAGER", "ADMIN"]);
  const shift = await getOpenShift(user.id);

  const openSessions = await prisma.tableSession.findMany({
    where: { status: "OPEN" },
    select: { id: true },
    orderBy: { openedAt: "asc" },
  });
  const details = (
    await Promise.all(openSessions.map((s) => getSessionDetail(s.id)))
  ).filter((d): d is SessionDetail => d !== null);

  const currency = details[0]?.settings.currency ?? "MMK";
  const toCollect = details.reduce((s, d) => s + Math.max(0, d.balance), 0);

  return (
    <div className="space-y-5">
      <LiveRefresh room="floor" events={["table:update"]} seconds={10} />

      {/* Shift banner */}
      {shift ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span>
            🟢 Shift open since {formatTime(shift.openedAt)} · float{" "}
            {formatMoney(shift.openingFloat, currency)}
          </span>
          <Link href="/cashier/shift" className="font-semibold underline">
            Manage / close shift
          </Link>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>⚠️ No open shift — you must open one before taking payments.</span>
          <Link href="/cashier/shift" className="font-semibold underline">
            Open shift
          </Link>
        </div>
      )}

      {/* Quick nav */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <NavCard href="/cashier/tables" icon="🪑" label="Tables & Reservations" />
        <NavCard href="/cashier/expenses" icon="🧾" label="Expenses" />
        <NavCard href="/cashier/shift" icon="💰" label="Shift / Cash" />
        <div className="rounded-xl bg-brand p-4 text-white">
          <div className="text-xs uppercase opacity-80">To collect</div>
          <div className="text-xl font-bold">{formatMoney(toCollect, currency)}</div>
        </div>
      </div>

      {/* Open bills */}
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
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-brand hover:shadow"
              >
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold">{d.session.table.label}</span>
                  <span className="text-xs text-gray-400">{d.diners} pax</span>
                </div>
                <div className="mt-2 text-2xl font-extrabold text-brand">
                  {formatMoney(d.bill.total, currency)}
                </div>
                {d.paid > 0 && (
                  <div className="text-xs text-gray-500">
                    paid {formatMoney(d.paid, currency)} · balance{" "}
                    {formatMoney(d.balance, currency)}
                  </div>
                )}
                <div className="mt-1 text-xs text-gray-400">
                  opened {formatTime(d.session.openedAt)}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function NavCard({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-brand hover:shadow"
    >
      <div className="text-2xl">{icon}</div>
      <div className="mt-1 text-sm font-semibold text-gray-700">{label}</div>
    </Link>
  );
}
