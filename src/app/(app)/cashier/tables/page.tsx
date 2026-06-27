import Link from "next/link";
import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import {
  reservationBlocksNow,
  STATUS_STYLES,
  type TableStatus,
} from "@/lib/floor";
import { formatDateTime } from "@/lib/format";
import LiveRefresh from "@/components/LiveRefresh";
import SubmitButton from "@/components/SubmitButton";
import {
  createReservation,
  seatReservation,
  cancelReservation,
  noShowReservation,
} from "../actions";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

function pad(n: number) { return String(n).padStart(2, "0"); }
function localInput(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function CashierTablesPage() {
  await requireAnyRole(["CASHIER", "MANAGER", "ADMIN"]);
  const settings = await getSettings();
  const t = await getT();
  const now = new Date();

  const statusLabels: Record<TableStatus, string> = {
    AVAILABLE: t("legend_available"),
    OCCUPIED:  t("legend_occupied"),
    BLOCKED:   t("legend_reserved"),
    MERGED:    t("legend_merged"),
    OVERDUE:   t("legend_overdue"),
  };

  const [areas, openSessions, merges, reservations, tablesFlat] = await Promise.all([
    prisma.area.findMany({
      where: { isActive: true },
      include: { tables: { where: { isActive: true }, orderBy: { number: "asc" } } },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.tableSession.findMany({ where: { status: "OPEN" }, select: { id: true, tableId: true, openedAt: true } }),
    prisma.tableMerge.findMany({ select: { tableId: true, sessionId: true } }),
    prisma.reservation.findMany({
      where: { status: "BOOKED" },
      include: { table: true },
      orderBy: { bookingAt: "asc" },
    }),
    prisma.table.findMany({ where: { isActive: true }, orderBy: { label: "asc" } }),
  ]);

  const openByTable = new Map(openSessions.map((s) => [s.tableId, s]));
  const sessionById = new Map(openSessions.map((s) => [s.id, s]));
  const mergedToSession = new Map(
    merges
      .map((m) => [m.tableId, sessionById.get(m.sessionId)])
      .filter((e): e is [string, typeof openSessions[0]] => e[1] !== undefined),
  );

  return (
    <div className="space-y-5">
      <LiveRefresh room="floor" events={["table:update"]} seconds={15} />

      <div className="flex items-center gap-3">
        <Link href="/cashier" className="text-sm text-brand hover:underline">← {t("nav_cashier")}</Link>
        <h1 className="text-xl font-bold">{t("heading_tables_reservations")}</h1>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {areas.map((area) => (
            <section key={area.id}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Area {area.name}
              </h2>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                {area.tables.map((tbl) => {
                  const sess = openByTable.get(tbl.id) ?? mergedToSession.get(tbl.id);
                  const isMerged = !openByTable.has(tbl.id) && mergedToSession.has(tbl.id);
                  let status: TableStatus = "AVAILABLE";
                  if (sess) {
                    const minsOpen = (now.getTime() - new Date(sess.openedAt).getTime()) / 60000;
                    status = minsOpen >= 105 ? "OVERDUE" : "OCCUPIED";
                  } else if (
                    reservations.some(
                      (r) =>
                        r.tableId === tbl.id &&
                        reservationBlocksNow(r.bookingAt, r.durationMin, settings.reservationBlockMins, now),
                    )
                  )
                    status = "BLOCKED";
                  const inner = (
                    <>
                      <div className="text-base font-bold">{tbl.label}</div>
                      <div className="text-[10px]">{isMerged ? statusLabels.MERGED : statusLabels[status]}</div>
                    </>
                  );
                  return sess ? (
                    <Link
                      key={tbl.id}
                      href={`/cashier/checkout/${sess.id}`}
                      className={"flex aspect-square flex-col items-center justify-center rounded-lg border-2 " + STATUS_STYLES[status]}
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div
                      key={tbl.id}
                      className={"flex aspect-square flex-col items-center justify-center rounded-lg border-2 " + STATUS_STYLES[status]}
                    >
                      {inner}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <div className="space-y-4">
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-700">{t("section_new_reservation")}</h3>
            <form action={createReservation} className="space-y-2 text-sm">
              <input name="customerName" required placeholder={t("placeholder_customer_name")}
                className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              <div className="grid grid-cols-2 gap-2">
                <input name="phone" placeholder={t("placeholder_phone")}
                  className="rounded-lg border border-gray-300 px-3 py-2" />
                <input name="partySize" type="number" min={1} defaultValue={4}
                  placeholder={t("placeholder_party")}
                  className="rounded-lg border border-gray-300 px-3 py-2" />
              </div>
              <input name="bookingAt" type="datetime-local" required
                defaultValue={localInput(new Date(now.getTime() + 60 * 60 * 1000))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              <div className="grid grid-cols-2 gap-2">
                <select name="tableId" className="rounded-lg border border-gray-300 px-3 py-2">
                  <option value="">{t("select_any_table")}</option>
                  {tablesFlat.map((tbl) => (
                    <option key={tbl.id} value={tbl.id}>{tbl.label}</option>
                  ))}
                </select>
                <input name="durationMin" type="number" min={30} step={15} defaultValue={120}
                  className="rounded-lg border border-gray-300 px-3 py-2" />
              </div>
              <input name="note" placeholder={t("placeholder_note_optional")}
                className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              <SubmitButton
                className="w-full rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                pendingText={t("pending_saving")}
              >
                {t("btn_add_reservation")}
              </SubmitButton>
              <p className="text-[11px] text-gray-400">
                {t("reservation_block_note", { mins: String(settings.reservationBlockMins) })}
              </p>
            </form>
          </section>

          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">
              {t("section_upcoming_reservations")} ({reservations.length})
            </h3>
            <ul className="space-y-2">
              {reservations.length === 0 && (
                <li className="text-sm text-gray-400">{t("empty_no_reservations")}</li>
              )}
              {reservations.map((r) => (
                <li key={r.id} className="rounded-lg border border-gray-100 bg-gray-50 p-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">
                      {r.customerName}{" "}
                      <span className="font-normal text-gray-400">· {r.partySize} pax</span>
                    </span>
                    <span className="text-xs text-gray-500">{r.table ? r.table.label : t("select_any_table")}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatDateTime(r.bookingAt)}{r.phone ? ` · ${r.phone}` : ""}
                  </div>
                  <div className="mt-1 flex gap-1">
                    <form action={seatReservation}>
                      <input type="hidden" name="reservationId" value={r.id} />
                      <button className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-emerald-700">
                        {t("btn_seat")}
                      </button>
                    </form>
                    <form action={noShowReservation}>
                      <input type="hidden" name="reservationId" value={r.id} />
                      <button className="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-100">
                        {t("btn_no_show")}
                      </button>
                    </form>
                    <form action={cancelReservation}>
                      <input type="hidden" name="reservationId" value={r.id} />
                      <button className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50">
                        {t("btn_cancel")}
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
