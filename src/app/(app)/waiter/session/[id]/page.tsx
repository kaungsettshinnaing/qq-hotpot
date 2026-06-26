import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSessionDetail } from "@/lib/orders";
import { formatTime } from "@/lib/format";
import BillSummary from "@/components/BillSummary";
import LiveRefresh from "@/components/LiveRefresh";
import SessionControls from "./SessionControls";
import { voidPot, cancelSession, mergeTable, unmergeTable } from "../../actions";

export const dynamic = "force-dynamic";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAnyRole(["WAITER", "MANAGER", "ADMIN"]);
  const { id } = await params;

  const detail = await getSessionDetail(id);
  if (!detail || detail.session.status !== "OPEN") redirect("/waiter");

  const SYSTEM_CODES = ["ADULT", "CHILD", "BEER", "POT_ADDON", "WASTAGE"];
  const [flavours, merges, allMergedIds, allOpenTableIds, orderableItems] = await Promise.all([
    prisma.soupFlavour.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, appliesTo: true },
    }),
    prisma.tableMerge.findMany({
      where: { sessionId: id },
      include: { table: true },
    }),
    prisma.tableMerge.findMany({ select: { tableId: true } }),
    prisma.tableSession.findMany({ where: { status: "OPEN" }, select: { tableId: true } }),
    prisma.menuItem.findMany({
      where: { isActive: true, code: { notIn: SYSTEM_CODES } },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: { code: true, name: true, price: true, category: true },
    }),
  ]);

  // Current qty per non-system item from the session
  const itemQtys: Record<string, number> = {};
  for (const oi of detail.session.orderItems) {
    if (!SYSTEM_CODES.includes(oi.itemCode)) {
      itemQtys[oi.itemCode] = (itemQtys[oi.itemCode] ?? 0) + oi.qty;
    }
  }

  const { session } = detail;
  const canCancel =
    detail.totalPots === 0 &&
    detail.beerQty === 0 &&
    session.wastageGrams === 0 &&
    detail.paid === 0;

  const occupiedTableIds = new Set([
    session.tableId,
    ...allMergedIds.map((m) => m.tableId),
    ...allOpenTableIds.map((s) => s.tableId),
  ]);

  const availableTables = await prisma.table.findMany({
    where: { isActive: true, id: { notIn: [...occupiedTableIds] } },
    include: { area: true },
    orderBy: [{ area: { sortOrder: "asc" } }, { number: "asc" }],
  });

  const mergedLabels = merges.map((m) => m.table.label);

  return (
    <div className="space-y-4">
      <LiveRefresh room="floor" events={["table:update"]} seconds={12} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/waiter" className="text-sm text-brand hover:underline">
            ← Tables
          </Link>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
            <h1 className="text-xl font-bold">
              Table {[session.table.label, ...mergedLabels].join(" + ")}
            </h1>
            <span className="text-sm text-gray-400">
              {detail.diners} pax · {formatTime(session.openedAt)}
            </span>
          </div>
        </div>
        {canCancel && (
          <form action={cancelSession}>
            <input type="hidden" name="sessionId" value={session.id} />
            <button className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 active:bg-red-100">
              Cancel table
            </button>
          </form>
        )}
      </div>

      {/* Merge controls */}
      <div className="flex flex-wrap items-center gap-2">
        {merges.map((m) => (
          <form key={m.id} action={unmergeTable} className="flex items-center gap-1">
            <input type="hidden" name="mergeId" value={m.id} />
            <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-700">
              +{m.table.label}
            </span>
            <button
              type="submit"
              className="rounded-full bg-violet-100 px-2 py-1 text-xs text-violet-600 hover:bg-violet-200"
            >
              ✕
            </button>
          </form>
        ))}
        {availableTables.length > 0 && (
          <form action={mergeTable} className="flex items-center gap-2">
            <input type="hidden" name="sessionId" value={session.id} />
            <select
              name="tableId"
              className="rounded-lg border border-gray-300 px-2 py-1 text-xs focus:border-brand focus:outline-none"
            >
              <option value="">Merge table…</option>
              {availableTables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-lg bg-violet-600 px-3 py-1 text-xs font-semibold text-white hover:bg-violet-700"
            >
              + Merge
            </button>
          </form>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SessionControls
          sessionId={session.id}
          initialAdults={session.adults}
          initialChildren={session.children}
          beerQty={detail.beerQty}
          wastageGrams={session.wastageGrams}
          allowance={detail.allowance}
          totalPots={detail.totalPots}
          flavours={flavours}
          orderableItems={orderableItems}
          itemQtys={itemQtys}
        />

        <div className="space-y-4">
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">
              Pots sent to kitchen ({detail.totalPots})
            </h3>
            <ul className="space-y-2">
              {detail.session.potOrders.length === 0 && (
                <li className="text-sm text-gray-400">No pots yet.</li>
              )}
              {detail.session.potOrders.map((p, idx) => {
                const isFree = idx < detail.allowance;
                return (
                  <li
                    key={p.id}
                    className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                  >
                    <div className="text-sm">
                      <span className="font-semibold">
                        {p.kind === "HOTPOT" ? "🍲 Hotpot" : "🔥 BBQ"}
                      </span>
                      <span
                        className={
                          "ml-2 rounded px-1.5 py-0.5 text-[11px] font-semibold " +
                          (isFree ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")
                        }
                      >
                        {isFree ? "FREE" : "PAID"}
                      </span>
                      <div className="text-xs text-gray-500">
                        {p.flavours.map((fl) => fl.flavour.name).join(", ")}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold " +
                          (p.status === "DELIVERED"
                            ? "bg-gray-200 text-gray-600"
                            : "bg-blue-100 text-blue-700")
                        }
                      >
                        {p.status === "DELIVERED" ? "Delivered" : "Pending"}
                      </span>
                      {p.status === "PENDING" && (
                        <form action={voidPot}>
                          <input type="hidden" name="potId" value={p.id} />
                          <button className="rounded-md border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50">
                            Void
                          </button>
                        </form>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">Running bill</h3>
            <BillSummary bill={detail.bill} currency={detail.settings.currency} />
            <p className="mt-2 text-xs text-gray-400">
              Payment is taken at the cashier.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
