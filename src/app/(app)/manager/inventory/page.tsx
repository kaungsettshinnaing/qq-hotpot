import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { resolveDelivery } from "@/app/(app)/inventory/deliveries/[id]/actions";

export const dynamic = "force-dynamic";

const UNIT_ABBR: Record<string, string> = {
  UNIT: "unit", GRAM: "g", KG: "kg", LITRE: "L", BOX: "box", BOTTLE: "btl", PACK: "pack",
};

export default async function ManagerInventoryPage() {
  const discrepancies = await prisma.stockDelivery.findMany({
    where: { status: "PENDING_REVIEW" },
    orderBy: { createdAt: "asc" },
    include: {
      supplier: { select: { name: true } },
      cashierEnteredBy: { select: { name: true } },
      counterEnteredBy: { select: { name: true } },
      items: {
        include: { stockItem: { select: { name: true, unit: true } } },
        orderBy: { stockItem: { name: "asc" } },
      },
    },
  });

  const prepaid = await prisma.stockDelivery.findMany({
    where: { status: "PREPAID" },
    orderBy: { prepaidAt: "asc" },
    include: { supplier: { select: { name: true } } },
  });

  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold text-gray-800">Inventory — Manager Review</h2>

      {/* Pre-paid deliveries awaiting receipt */}
      {prepaid.length > 0 && (
        <section className="rounded-xl bg-yellow-50 border border-yellow-200 p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-yellow-800">
            Pre-paid — Awaiting Delivery ({prepaid.length})
          </h3>
          <div className="space-y-2">
            {prepaid.map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 shadow-sm text-sm">
                <div>
                  <p className="font-medium text-gray-800">{d.supplier?.name ?? "Unknown supplier"}</p>
                  <p className="text-xs text-gray-500">
                    Pre-paid {d.prepaidAt ? formatDate(d.prepaidAt) : "—"} ·{" "}
                    {d.totalCost != null ? `${d.totalCost.toLocaleString()} MMK` : "—"}
                    {d.invoiceNo && ` · #${d.invoiceNo}`}
                  </p>
                </div>
                <Link href={`/inventory/deliveries/${d.id}`}
                  className="text-xs text-blue-600 hover:underline">View</Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Discrepancies */}
      {discrepancies.length === 0 ? (
        <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-6 text-center text-sm text-green-700">
          No discrepancies pending review. All deliveries are reconciled.
        </div>
      ) : (
        <div className="space-y-5">
          {discrepancies.map((delivery) => (
            <section key={delivery.id} className="rounded-xl border-2 border-orange-300 bg-white shadow-sm">
              <div className="border-b border-orange-100 px-4 py-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-800">
                    {delivery.supplier?.name ?? "Unknown supplier"} —{" "}
                    {delivery.invoiceNo ? `#${delivery.invoiceNo}` : delivery.id.slice(-6)}
                  </h3>
                  <Link href={`/inventory/deliveries/${delivery.id}`}
                    className="text-xs text-blue-600 hover:underline">Full view</Link>
                </div>
                <p className="mt-0.5 text-xs text-gray-500">
                  {formatDate(delivery.deliveryDate)} ·
                  Cashier: {delivery.cashierEnteredBy?.name ?? "—"} ·
                  Counter: {delivery.counterEnteredBy?.name ?? "—"}
                </p>
              </div>

              <form action={resolveDelivery} className="p-4 space-y-4">
                <input type="hidden" name="deliveryId" value={delivery.id} />

                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500">
                      <th className="pb-2 text-left font-medium">Item</th>
                      <th className="pb-2 text-center font-medium">Cashier</th>
                      <th className="pb-2 text-center font-medium">Counter</th>
                      <th className="pb-2 text-center font-medium">Diff</th>
                      <th className="pb-2 text-center font-medium">Final qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {delivery.items.map((item) => {
                      const diff = (item.cashierQty ?? 0) - (item.counterQty ?? 0);
                      return (
                        <tr key={item.id}>
                          <td className="py-1.5 text-gray-700">{item.stockItem.name}</td>
                          <td className="py-1.5 text-center">{item.cashierQty ?? "—"}</td>
                          <td className="py-1.5 text-center">{item.counterQty ?? "—"}</td>
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
                            <span className="ml-1 text-xs text-gray-400">{UNIT_ABBR[item.stockItem.unit]}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <textarea
                  name="resolutionNote"
                  placeholder="Resolution note (e.g. recount confirmed 20, counter missed 2)"
                  required
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input type="checkbox" name="isPartial" className="rounded" />
                    Partial delivery — more items expected
                  </label>
                  <button type="submit"
                    className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700">
                    Confirm & complete
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
