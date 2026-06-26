import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  DRAFT:          { label: "Draft",           cls: "bg-gray-100 text-gray-600" },
  PREPAID:        { label: "Pre-paid",         cls: "bg-yellow-100 text-yellow-700" },
  OPEN:           { label: "Awaiting Count",  cls: "bg-blue-100 text-blue-700" },
  PENDING_REVIEW: { label: "Discrepancy",     cls: "bg-orange-100 text-orange-700" },
  PARTIAL:        { label: "Partial",         cls: "bg-purple-100 text-purple-700" },
  COMPLETE:       { label: "Complete",        cls: "bg-green-100 text-green-700" },
};

export default async function DeliveriesPage() {
  const deliveries = await prisma.stockDelivery.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      supplier: { select: { name: true } },
      createdBy: { select: { name: true } },
      items: { select: { id: true } },
      parentDelivery: { select: { id: true, invoiceNo: true } },
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800">Deliveries</h2>
        <Link href="/inventory/deliveries/new"
          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark">
          + New Delivery
        </Link>
      </div>

      <section className="rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-500">
              <th className="px-4 py-2 text-left font-medium">Date</th>
              <th className="px-4 py-2 text-left font-medium">Supplier</th>
              <th className="px-4 py-2 text-left font-medium">Invoice #</th>
              <th className="px-4 py-2 text-center font-medium">Items</th>
              <th className="px-4 py-2 text-right font-medium">Cost</th>
              <th className="px-4 py-2 text-center font-medium">Status</th>
              <th className="px-4 py-2 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {deliveries.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                  No deliveries yet. Create one to start tracking stock.
                </td>
              </tr>
            )}
            {deliveries.map((d) => {
              const badge = STATUS_BADGE[d.status] ?? STATUS_BADGE.DRAFT;
              return (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-600">
                    {formatDate(d.deliveryDate)}
                  </td>
                  <td className="px-4 py-2 font-medium text-gray-800">
                    {d.supplier?.name ?? <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-2 text-gray-600">
                    {d.invoiceNo ?? "—"}
                    {d.parentDelivery && (
                      <span className="ml-1 text-xs text-purple-600">(batch)</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center text-gray-600">{d.items.length}</td>
                  <td className="px-4 py-2 text-right text-gray-700">
                    {d.totalCost != null ? `${d.totalCost.toLocaleString()} MMK` : "—"}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/inventory/deliveries/${d.id}`}
                      className="text-xs text-blue-600 hover:underline">
                      View
                    </Link>
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
