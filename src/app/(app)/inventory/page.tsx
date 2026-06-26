import Link from "next/link";
import { prisma } from "@/lib/db";
import { computeAllStockLevels } from "@/lib/inventory";

export const dynamic = "force-dynamic";

const UNIT_LABEL: Record<string, string> = {
  UNIT: "unit", GRAM: "g", KG: "kg", LITRE: "L", BOX: "box", BOTTLE: "bottle", PACK: "pack",
};

export default async function InventoryDashboard() {
  const [items, stockMap, pendingCount, discrepancyCount, prepaidCount] = await Promise.all([
    prisma.stockItem.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    computeAllStockLevels(),
    prisma.stockDelivery.count({ where: { status: { in: ["OPEN", "DRAFT", "PREPAID"] } } }),
    prisma.stockDelivery.count({ where: { status: "PENDING_REVIEW" } }),
    prisma.stockDelivery.count({ where: { status: "PREPAID" } }),
  ]);

  const lowStock = items.filter((i) => {
    const current = stockMap.get(i.id) ?? 0;
    return i.minStock != null && current <= i.minStock;
  });

  return (
    <div className="space-y-5">
      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Active Items</p>
          <p className="mt-1 text-2xl font-bold text-gray-800">{items.length}</p>
        </div>
        {lowStock.length > 0 && (
          <div className="rounded-xl bg-red-50 p-4 shadow-sm">
            <p className="text-xs text-red-600">Low Stock Alerts</p>
            <p className="mt-1 text-2xl font-bold text-red-700">{lowStock.length}</p>
          </div>
        )}
        {prepaidCount > 0 && (
          <div className="rounded-xl bg-yellow-50 p-4 shadow-sm">
            <p className="text-xs text-yellow-700">Pre-paid (at vendor)</p>
            <p className="mt-1 text-2xl font-bold text-yellow-800">{prepaidCount}</p>
          </div>
        )}
        {discrepancyCount > 0 && (
          <div className="rounded-xl bg-orange-50 p-4 shadow-sm">
            <p className="text-xs text-orange-600">Discrepancies</p>
            <p className="mt-1 text-2xl font-bold text-orange-700">{discrepancyCount}</p>
          </div>
        )}
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Pending Deliveries</p>
          <p className="mt-1 text-2xl font-bold text-gray-800">{pendingCount}</p>
        </div>
      </div>

      {/* Low stock alert */}
      {lowStock.length > 0 && (
        <section className="rounded-xl bg-red-50 border border-red-200 p-4">
          <h3 className="mb-2 text-sm font-semibold text-red-700">Low Stock — Order Required</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {lowStock.map((item) => {
              const current = stockMap.get(item.id) ?? 0;
              const toOrder = item.optimalStock != null ? item.optimalStock - current : null;
              return (
                <div key={item.id} className="rounded-lg bg-white p-3 shadow-sm">
                  <p className="font-medium text-sm text-gray-800">{item.name}</p>
                  <p className="text-xs text-red-600 mt-0.5">
                    Current: <strong>{current}</strong> {UNIT_LABEL[item.unit]}
                    {" "}(min: {item.minStock})
                  </p>
                  {toOrder != null && toOrder > 0 && (
                    <p className="text-xs text-gray-500">Order {toOrder} {UNIT_LABEL[item.unit]} to reach optimal</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Full stock table */}
      <section className="rounded-xl bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
          <h3 className="text-sm font-semibold text-gray-700">All stock items</h3>
          <Link href="/inventory/deliveries/new"
            className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark">
            + New Delivery
          </Link>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-500">
              <th className="px-4 py-2 text-left font-medium">Item</th>
              <th className="px-4 py-2 text-center font-medium">Current</th>
              <th className="px-4 py-2 text-center font-medium">Min</th>
              <th className="px-4 py-2 text-center font-medium">Optimal</th>
              <th className="px-4 py-2 text-center font-medium">To Order</th>
              <th className="px-4 py-2 text-center font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((item) => {
              const current = stockMap.get(item.id) ?? 0;
              const isLow = item.minStock != null && current <= item.minStock;
              const isOk = item.optimalStock != null && current >= item.optimalStock;
              const toOrder = item.optimalStock != null ? Math.max(0, item.optimalStock - current) : null;
              return (
                <tr key={item.id} className={isLow ? "bg-red-50" : ""}>
                  <td className="px-4 py-2 font-medium text-gray-800">{item.name}</td>
                  <td className={`px-4 py-2 text-center font-bold ${isLow ? "text-red-600" : isOk ? "text-green-600" : "text-yellow-600"}`}>
                    {current} <span className="text-xs font-normal text-gray-400">{UNIT_LABEL[item.unit]}</span>
                  </td>
                  <td className="px-4 py-2 text-center text-gray-500">{item.minStock ?? "—"}</td>
                  <td className="px-4 py-2 text-center text-gray-500">{item.optimalStock ?? "—"}</td>
                  <td className="px-4 py-2 text-center text-gray-600">
                    {toOrder != null ? (toOrder > 0 ? toOrder : "—") : "—"}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {isLow ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Low</span>
                    ) : isOk ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">OK</span>
                    ) : (
                      <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">Below Optimal</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  No stock items. Add them in Admin → Stock Items.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
