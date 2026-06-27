import { prisma } from "@/lib/db";
import { computeAllStockLevels } from "@/lib/inventory";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

export default async function InventoryReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ months?: string }>;
}) {
  const { months } = await searchParams;
  const t = await getT();

  const lookbackMonths = Math.min(Math.max(parseInt(months ?? "3", 10), 1), 12);
  const since = new Date();
  since.setMonth(since.getMonth() - lookbackMonths);
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  const [suppliers, stockItems, stockMap] = await Promise.all([
    prisma.supplier.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: {
        deliveries: {
          where: {
            deliveryDate: { gte: since },
            paymentStatus: { in: ["PREPAID", "PAID"] },
            totalCost: { not: null },
          },
          select: { totalCost: true, deliveryDate: true, status: true },
        },
      },
    }),
    prisma.stockItem.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: {
        movements: {
          where: { createdAt: { gte: since } },
          select: { type: true, qty: true },
        },
      },
    }),
    computeAllStockLevels(),
  ]);

  const UNIT_ABBR: Record<string, string> = {
    UNIT: "unit", GRAM: "g", KG: "kg", LITRE: "L", BOX: "box", BOTTLE: "btl", PACK: "pack",
  };

  const periodLabel = t("label_last_months", { n: String(lookbackMonths) });

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center gap-3">
        <h2 className="text-base font-semibold text-gray-800">{t("heading_inventory_reports")}</h2>
        <div className="flex gap-1">
          {[1, 3, 6, 12].map((m) => (
            <a key={m} href={`/inventory/reports?months=${m}`}
              className={`rounded-lg px-3 py-1 text-sm font-medium ${
                lookbackMonths === m ? "bg-brand text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}>
              {m}M
            </a>
          ))}
        </div>
      </div>

      {/* Supplier spend */}
      <section className="rounded-xl bg-white shadow-sm">
        <h3 className="border-b border-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">
          {t("section_supplier_spend")} — {periodLabel}
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-500">
              <th className="px-4 py-2 text-left font-medium">{t("col_supplier")}</th>
              <th className="px-4 py-2 text-center font-medium">{t("col_deliveries")}</th>
              <th className="px-4 py-2 text-right font-medium">{t("col_total_spent")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {suppliers
              .filter((s) => s.deliveries.length > 0)
              .sort((a, b) => {
                const ta = a.deliveries.reduce((s, d) => s + (d.totalCost ?? 0), 0);
                const tb = b.deliveries.reduce((s, d) => s + (d.totalCost ?? 0), 0);
                return tb - ta;
              })
              .map((s) => {
                const total = s.deliveries.reduce((sum, d) => sum + (d.totalCost ?? 0), 0);
                return (
                  <tr key={s.id}>
                    <td className="px-4 py-2 font-medium text-gray-800">{s.name}</td>
                    <td className="px-4 py-2 text-center text-gray-600">{s.deliveries.length}</td>
                    <td className="px-4 py-2 text-right font-semibold text-gray-800">
                      {total.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            {suppliers.every((s) => s.deliveries.length === 0) && (
              <tr>
                <td colSpan={3} className="px-4 py-4 text-center text-gray-400">
                  {t("empty_no_completed_deliveries")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Stock consumption by item */}
      <section className="rounded-xl bg-white shadow-sm">
        <h3 className="border-b border-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">
          {t("section_stock_consumption")} — {periodLabel}
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-500">
              <th className="px-4 py-2 text-left font-medium">{t("col_item")}</th>
              <th className="px-4 py-2 text-center font-medium">{t("col_received")}</th>
              <th className="px-4 py-2 text-center font-medium">{t("col_used")}</th>
              <th className="px-4 py-2 text-center font-medium">{t("col_adjusted")}</th>
              <th className="px-4 py-2 text-center font-medium">{t("col_current_stock")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {stockItems.map((item) => {
              const received = item.movements
                .filter((m) => m.type === "DELIVERY_IN")
                .reduce((sum, m) => sum + m.qty, 0);
              const used = Math.abs(
                item.movements
                  .filter((m) => m.type === "USAGE_OUT")
                  .reduce((sum, m) => sum + m.qty, 0)
              );
              const adjusted = item.movements
                .filter((m) => m.type === "ADJUSTMENT")
                .reduce((sum, m) => sum + m.qty, 0);
              const current = stockMap.get(item.id) ?? 0;
              const isLow = item.minStock != null && current <= item.minStock;
              return (
                <tr key={item.id}>
                  <td className="px-4 py-2 font-medium text-gray-800">{item.name}</td>
                  <td className="px-4 py-2 text-center text-green-600">
                    {received > 0 ? `+${received}` : "—"} <span className="text-xs text-gray-400">{UNIT_ABBR[item.unit]}</span>
                  </td>
                  <td className="px-4 py-2 text-center text-red-600">
                    {used > 0 ? `-${used}` : "—"}
                  </td>
                  <td className="px-4 py-2 text-center text-blue-600">
                    {adjusted !== 0 ? (adjusted > 0 ? `+${adjusted}` : adjusted) : "—"}
                  </td>
                  <td className={`px-4 py-2 text-center font-bold ${isLow ? "text-red-600" : "text-gray-700"}`}>
                    {current}
                    {isLow && <span className="ml-1 text-xs text-red-500">({t("badge_low")})</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
