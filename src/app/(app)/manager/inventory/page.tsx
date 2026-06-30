import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { resolveDelivery } from "@/app/(app)/inventory/deliveries/[id]/actions";
import { startSpotCheck, startWeeklyCount, submitStockCount } from "./actions";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

const MM_OFFSET_MS = (6 * 60 + 30) * 60 * 1000;
function myanmarToday(): Date {
  const mmNow = new Date(Date.now() + MM_OFFSET_MS);
  return new Date(Date.UTC(mmNow.getUTCFullYear(), mmNow.getUTCMonth(), mmNow.getUTCDate()));
}

const UNIT_ABBR: Record<string, string> = {
  UNIT: "unit", GRAM: "g", KG: "kg", LITRE: "L", BOX: "box", BOTTLE: "btl", PACK: "pack",
};

export default async function ManagerInventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; countId?: string }>;
}) {
  const t = await getT();
  const { tab = "review", countId } = await searchParams;

  const tabs = [
    { key: "review",     label: t("tab_discrepancy_review") },
    { key: "spot-check", label: t("tab_spot_check") },
    { key: "weekly",     label: t("tab_weekly_count") },
  ];

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-gray-800">{t("heading_inventory_manager_review")}</h2>

      <div className="flex overflow-x-auto border-b border-gray-200">
        {tabs.map((tb) => (
          <Link key={tb.key} href={`/manager/inventory?tab=${tb.key}`}
            className={"whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition -mb-px " +
              (tab === tb.key ? "border-brand text-brand" : "border-transparent text-gray-500 hover:text-gray-700")}>
            {tb.label}
          </Link>
        ))}
      </div>

      {tab === "review"     && <DiscrepancyTab />}
      {tab === "spot-check" && <SpotCheckTab countId={countId} />}
      {tab === "weekly"     && <WeeklyCountTab countId={countId} />}
    </div>
  );
}

async function DiscrepancyTab() {
  const t = await getT();
  const [discrepancies, prepaid] = await Promise.all([
    prisma.stockDelivery.findMany({
      where: { status: "PENDING_REVIEW" },
      orderBy: { createdAt: "asc" },
      include: {
        supplier: { select: { name: true } },
        cashierEnteredBy: { select: { name: true } },
        counterEnteredBy: { select: { name: true } },
        items: {
          where: { stockItemId: { not: null } },
          include: { stockItem: { select: { name: true, unit: true } } },
          orderBy: { stockItem: { name: "asc" } },
        },
      },
    }),
    prisma.stockDelivery.findMany({
      where: { status: "PREPAID" },
      orderBy: { prepaidAt: "asc" },
      include: { supplier: { select: { name: true } } },
    }),
  ]);

  return (
    <div className="space-y-6">
      {prepaid.length > 0 && (
        <section className="rounded-xl bg-yellow-50 border border-yellow-200 p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-yellow-800">
            {t("label_pre_paid_awaiting")} ({prepaid.length})
          </h3>
          <div className="space-y-2">
            {prepaid.map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 shadow-sm text-sm">
                <div>
                  <p className="font-medium text-gray-800">{d.supplier?.name ?? t("label_unknown_supplier")}</p>
                  <p className="text-xs text-gray-500">
                    {t("label_pre_paid")} {d.prepaidAt ? formatDate(d.prepaidAt) : "—"} ·{" "}
                    {d.totalCost != null ? `${d.totalCost.toLocaleString()} MMK` : "—"}
                    {d.invoiceNo && ` · #${d.invoiceNo}`}
                  </p>
                </div>
                <Link href={`/inventory/deliveries/${d.id}`}
                  className="text-xs text-blue-600 hover:underline">{t("btn_view_report")}</Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {discrepancies.length === 0 ? (
        <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-6 text-center text-sm text-green-700">
          {t("empty_no_discrepancies")}
        </div>
      ) : (
        <div className="space-y-5">
          {discrepancies.map((delivery) => (
            <section key={delivery.id} className="rounded-xl border-2 border-orange-300 bg-white shadow-sm">
              <div className="border-b border-orange-100 px-4 py-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-800">
                    {delivery.supplier?.name ?? t("label_unknown_supplier")} —{" "}
                    {delivery.invoiceNo ? `#${delivery.invoiceNo}` : delivery.id.slice(-6)}
                  </h3>
                  <Link href={`/inventory/deliveries/${delivery.id}`}
                    className="text-xs text-blue-600 hover:underline">{t("link_full_view")}</Link>
                </div>
                <p className="mt-0.5 text-xs text-gray-500">
                  {formatDate(delivery.deliveryDate)} ·{" "}
                  {t("col_cashier")}: {delivery.cashierEnteredBy?.name ?? "—"} ·{" "}
                  {t("col_counter")}: {delivery.counterEnteredBy?.name ?? "—"}
                </p>
              </div>

              <form action={resolveDelivery} className="p-4 space-y-4">
                <input type="hidden" name="deliveryId" value={delivery.id} />

                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500">
                      <th className="pb-2 text-left font-medium">{t("col_item")}</th>
                      <th className="pb-2 text-center font-medium">{t("col_cashier")}</th>
                      <th className="pb-2 text-center font-medium">{t("col_counter")}</th>
                      <th className="pb-2 text-center font-medium">{t("col_diff")}</th>
                      <th className="pb-2 text-center font-medium">{t("col_final_qty")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {delivery.items.map((item) => {
                      if (!item.stockItem) return null;
                      const unit = UNIT_ABBR[item.stockItem.unit] ?? item.stockItem.unit;
                      const diff = (item.cashierQty ?? 0) - (item.counterQty ?? 0);
                      return (
                        <tr key={item.id}>
                          <td className="py-1.5 text-gray-700">
                            {item.stockItem.name}
                            <span className="ml-1 text-xs text-gray-400">({unit})</span>
                          </td>
                          <td className="py-1.5 text-center">
                            {item.cashierQty ?? "—"}
                            {item.cashierQty != null && <span className="ml-1 text-xs text-gray-400">{unit}</span>}
                          </td>
                          <td className="py-1.5 text-center">
                            {item.counterQty ?? "—"}
                            {item.counterQty != null && <span className="ml-1 text-xs text-gray-400">{unit}</span>}
                          </td>
                          <td className={`py-1.5 text-center font-bold ${diff !== 0 ? "text-orange-600" : "text-green-600"}`}>
                            {diff !== 0 ? (diff > 0 ? `+${diff}` : diff) : "✓"}
                          </td>
                          <td className="py-1.5 text-center">
                            <input
                              name={`final_${item.id}`}
                              type="number"
                              min="0"
                              defaultValue={item.cashierQty ?? item.counterQty ?? 0}
                              className="w-20 rounded border border-gray-300 px-2 py-1 text-center"
                            />
                            <span className="ml-1 text-xs text-gray-400">{unit}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <textarea
                  name="resolutionNote"
                  placeholder={t("placeholder_resolution_note")}
                  required
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input type="checkbox" name="isPartial" className="rounded" />
                    {t("label_partial_delivery")}
                  </label>
                  <button type="submit"
                    className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700">
                    {t("btn_confirm_complete")}
                  </button>
                </div>
              </form>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

async function SpotCheckTab({ countId }: { countId?: string }) {
  const t = await getT();
  const today = myanmarToday();

  const activeCount = await prisma.stockCount.findFirst({
    where: { date: today, type: "SPOT", completedAt: null },
    include: {
      items: {
        include: { stockItem: { select: { name: true, unit: true } } },
        orderBy: { stockItem: { name: "asc" } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const recentCompleted = await prisma.stockCount.findMany({
    where: { type: "SPOT", completedAt: { not: null } },
    orderBy: { completedAt: "desc" },
    take: 5,
    include: {
      _count: { select: { items: true } },
      createdBy: { select: { name: true } },
    },
  });

  return (
    <div className="space-y-5">
      <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-700">
        {t("label_spot_check_hint")}
      </div>

      {!activeCount ? (
        <div className="rounded-xl bg-white p-6 shadow-sm text-center space-y-3">
          <p className="text-sm text-gray-500">{t("empty_no_active_count")}</p>
          <form action={startSpotCheck}>
            <button type="submit"
              className="rounded-lg bg-brand px-6 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
              {t("btn_start_spot_check")}
            </button>
          </form>
        </div>
      ) : (
        <section className="rounded-xl bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-800">
              {t("heading_spot_check")} — {activeCount.items.length} items
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">{formatDate(activeCount.createdAt)}</p>
          </div>
          <form action={submitStockCount} className="p-4 space-y-4">
            <input type="hidden" name="countId" value={activeCount.id} />
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-500">
                  <th className="pb-2 text-left font-medium">{t("col_item")}</th>
                  <th className="pb-2 text-center font-medium">{t("col_system_qty")}</th>
                  <th className="pb-2 text-center font-medium">{t("col_actual_qty")}</th>
                  <th className="pb-2 text-center font-medium">{t("label_confirm_system_qty")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {activeCount.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2 font-medium text-gray-700">
                      {item.stockItem.name}
                      <span className="ml-1 text-xs text-gray-400">({UNIT_ABBR[item.stockItem.unit]})</span>
                    </td>
                    <td className="py-2 text-center text-gray-600">{item.systemQty}</td>
                    <td className="py-2 text-center">
                      <input name={`actual_${item.id}`} type="number" min="0" placeholder="—"
                        className="w-20 rounded border border-gray-200 px-2 py-1 text-center text-sm" />
                    </td>
                    <td className="py-2 text-center">
                      <input type="checkbox" name={`confirm_${item.id}`} className="h-4 w-4 rounded" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">{t("col_note")} (optional)</label>
              <input name="note" maxLength={500} placeholder="Notes on discrepancies found…"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <button type="submit"
              className="w-full rounded-lg bg-brand py-2 text-sm font-semibold text-white hover:bg-brand-dark">
              {t("btn_complete_count")}
            </button>
          </form>
        </section>
      )}

      {recentCompleted.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Recent spot checks</h3>
          <div className="space-y-1">
            {recentCompleted.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg border bg-white px-3 py-2 text-sm">
                <span className="text-gray-700">{formatDate(c.completedAt!)}</span>
                <span className="text-xs text-gray-400">{c._count.items} items · {c.createdBy.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

async function WeeklyCountTab({ countId }: { countId?: string }) {
  const t = await getT();
  const today = myanmarToday();

  const activeCount = await prisma.stockCount.findFirst({
    where: { date: today, type: "WEEKLY", completedAt: null },
    include: {
      items: {
        include: {
          stockItem: { select: { name: true, unit: true, category: { select: { name: true } } } },
        },
        orderBy: [{ stockItem: { category: { name: "asc" } } }, { stockItem: { name: "asc" } }],
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const recentCompleted = await prisma.stockCount.findMany({
    where: { type: "WEEKLY", completedAt: { not: null } },
    orderBy: { completedAt: "desc" },
    take: 5,
    include: {
      _count: { select: { items: true } },
      createdBy: { select: { name: true } },
    },
  });

  return (
    <div className="space-y-5">
      <div className="rounded-lg bg-purple-50 border border-purple-100 px-4 py-3 text-sm text-purple-700">
        {t("label_weekly_count_hint")}
      </div>

      {!activeCount ? (
        <div className="rounded-xl bg-white p-6 shadow-sm text-center space-y-3">
          <p className="text-sm text-gray-500">{t("empty_no_active_count")}</p>
          <form action={startWeeklyCount}>
            <button type="submit"
              className="rounded-lg bg-purple-600 px-6 py-2 text-sm font-semibold text-white hover:bg-purple-700">
              {t("btn_start_weekly_count")}
            </button>
          </form>
        </div>
      ) : (
        <section className="rounded-xl bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-800">
              {t("heading_weekly_count")} — {activeCount.items.length} items
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">{formatDate(activeCount.createdAt)}</p>
          </div>
          <form action={submitStockCount} className="p-4 space-y-4">
            <input type="hidden" name="countId" value={activeCount.id} />

            {(() => {
              const grouped = new Map<string, typeof activeCount.items>();
              for (const item of activeCount.items) {
                const cat = item.stockItem.category?.name ?? "Uncategorized";
                if (!grouped.has(cat)) grouped.set(cat, []);
                grouped.get(cat)!.push(item);
              }
              return [...grouped.entries()].map(([catName, items]) => (
                <div key={catName}>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{catName}</h4>
                  <table className="w-full text-sm mb-4">
                    <thead>
                      <tr className="text-xs text-gray-400">
                        <th className="pb-1 text-left font-medium">{t("col_item")}</th>
                        <th className="pb-1 text-center font-medium">{t("col_system_qty")}</th>
                        <th className="pb-1 text-center font-medium">{t("col_actual_qty")}</th>
                        <th className="pb-1 text-center font-medium">✓</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {items.map((item) => (
                        <tr key={item.id}>
                          <td className="py-2 font-medium text-gray-700">
                            {item.stockItem.name}
                            <span className="ml-1 text-xs text-gray-400">({UNIT_ABBR[item.stockItem.unit]})</span>
                          </td>
                          <td className="py-2 text-center text-gray-600">{item.systemQty}</td>
                          <td className="py-2 text-center">
                            <input name={`actual_${item.id}`} type="number" min="0" placeholder="—"
                              className="w-20 rounded border border-gray-200 px-2 py-1 text-center text-sm" />
                          </td>
                          <td className="py-2 text-center">
                            <input type="checkbox" name={`confirm_${item.id}`} className="h-4 w-4 rounded" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ));
            })()}

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">{t("col_note")} (optional)</label>
              <input name="note" maxLength={500} placeholder="Notes…"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <button type="submit"
              className="w-full rounded-lg bg-purple-600 py-2 text-sm font-semibold text-white hover:bg-purple-700">
              {t("btn_complete_count")}
            </button>
          </form>
        </section>
      )}

      {recentCompleted.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Recent weekly counts</h3>
          <div className="space-y-1">
            {recentCompleted.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg border bg-white px-3 py-2 text-sm">
                <span className="text-gray-700">{formatDate(c.completedAt!)}</span>
                <span className="text-xs text-gray-400">{c._count.items} items · {c.createdBy.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
