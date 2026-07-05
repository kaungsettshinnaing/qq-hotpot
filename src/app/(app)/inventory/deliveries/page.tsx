import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

export default async function DeliveriesPage() {
  const t = await getT();

  const statusBadge = {
    DRAFT:          { label: t("badge_draft"),         cls: "bg-gray-100 text-gray-600" },
    PREPAID:        { label: t("badge_prepaid"),        cls: "bg-yellow-100 text-yellow-700" },
    OPEN:           { label: t("badge_awaiting_count"), cls: "bg-blue-100 text-blue-700" },
    PENDING_REVIEW: { label: t("badge_discrepancy"),    cls: "bg-orange-100 text-orange-700" },
    PARTIAL:        { label: t("badge_partial"),        cls: "bg-purple-100 text-purple-700" },
    COMPLETE:       { label: t("badge_complete"),       cls: "bg-green-100 text-green-700" },
  } as Record<string, { label: string; cls: string }>;

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
        <h2 className="text-base font-semibold text-gray-800">{t("heading_deliveries")}</h2>
        <p className="text-xs text-gray-400">{t("hint_invoices_from_expenses")}</p>
      </div>

      <section className="rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-500">
              <th className="px-4 py-2 text-left font-medium">{t("col_date")}</th>
              <th className="px-4 py-2 text-left font-medium">{t("col_supplier")}</th>
              <th className="px-4 py-2 text-left font-medium">{t("col_invoice")}</th>
              <th className="px-4 py-2 text-center font-medium">{t("col_items")}</th>
              <th className="px-4 py-2 text-right font-medium">{t("col_cost")}</th>
              <th className="px-4 py-2 text-center font-medium">{t("col_status")}</th>
              <th className="px-4 py-2 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {deliveries.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                  {t("empty_no_deliveries_full")}
                </td>
              </tr>
            )}
            {deliveries.map((d) => {
              const badge = statusBadge[d.status] ?? statusBadge.DRAFT;
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
                      <span className="ml-1 text-xs text-purple-600">{t("label_batch_tag")}</span>
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
                      {t("btn_view")}
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
