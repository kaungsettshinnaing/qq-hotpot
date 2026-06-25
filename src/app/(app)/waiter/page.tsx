import Link from "next/link";
import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import {
  reservationBlocksNow,
  STATUS_STYLES,
  STATUS_LABEL,
  type TableStatus,
} from "@/lib/floor";
import { formatTime } from "@/lib/format";
import LiveRefresh from "@/components/LiveRefresh";

export const dynamic = "force-dynamic";

export default async function WaiterPage() {
  await requireAnyRole(["WAITER", "MANAGER", "ADMIN"]);
  const settings = await getSettings();

  const [areas, openSessions, reservations] = await Promise.all([
    prisma.area.findMany({
      where: { isActive: true },
      include: { tables: { where: { isActive: true }, orderBy: { number: "asc" } } },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.tableSession.findMany({
      where: { status: "OPEN" },
      select: { id: true, tableId: true, adults: true, children: true, openedAt: true },
    }),
    prisma.reservation.findMany({
      where: { status: "BOOKED" },
      select: { tableId: true, bookingAt: true, durationMin: true },
    }),
  ]);

  const openByTable = new Map(openSessions.map((s) => [s.tableId, s]));
  const now = new Date();

  return (
    <div className="space-y-6">
      <LiveRefresh room="floor" events={["table:update"]} seconds={10} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Tables</h1>
        <div className="flex gap-3 text-xs">
          <Legend className="bg-emerald-300" label="Available" />
          <Legend className="bg-red-300" label="Occupied" />
          <Legend className="bg-amber-300" label="Reserved" />
        </div>
      </div>

      {areas.map((area) => (
        <section key={area.id}>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Area {area.name}
          </h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
            {area.tables.map((t) => {
              const sess = openByTable.get(t.id);
              let status: TableStatus = "AVAILABLE";
              let resAt: Date | null = null;
              if (sess) {
                status = "OCCUPIED";
              } else {
                const res = reservations.find(
                  (r) =>
                    r.tableId === t.id &&
                    reservationBlocksNow(r.bookingAt, r.durationMin, settings.reservationBlockMins, now),
                );
                if (res) {
                  status = "BLOCKED";
                  resAt = res.bookingAt;
                }
              }
              const href = sess ? `/waiter/session/${sess.id}` : `/waiter/open/${t.id}`;
              return (
                <Link
                  key={t.id}
                  href={href}
                  className={
                    "flex aspect-square flex-col items-center justify-center rounded-xl border-2 p-2 text-center transition " +
                    STATUS_STYLES[status]
                  }
                >
                  <div className="text-lg font-extrabold">{t.label}</div>
                  <div className="text-[11px] font-medium">{STATUS_LABEL[status]}</div>
                  {sess && (
                    <div className="text-[10px] opacity-80">
                      {sess.adults + sess.children} pax · {formatTime(sess.openedAt)}
                    </div>
                  )}
                  {status === "BLOCKED" && resAt && (
                    <div className="text-[10px] opacity-80">@ {formatTime(resAt)}</div>
                  )}
                </Link>
              );
            })}
            {area.tables.length === 0 && (
              <p className="col-span-full text-sm text-gray-400">No tables in this area.</p>
            )}
          </div>
        </section>
      ))}

      {areas.length === 0 && (
        <p className="text-sm text-gray-500">
          No areas/tables yet. Ask an admin to add them in the Admin panel.
        </p>
      )}
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={"inline-block h-3 w-3 rounded " + className} />
      {label}
    </span>
  );
}
