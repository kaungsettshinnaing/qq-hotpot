import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { hasAnyRole } from "@/lib/rbac";
import { formatDate } from "@/lib/format";
import { resolveDelivery } from "./actions";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

const UNIT_ABBR: Record<string, string> = {
  UNIT: "unit", GRAM: "g", KG: "kg", LITRE: "L", BOX: "box", BOTTLE: "btl", PACK: "pack",
};

export default async function DeliveryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getT();

  const statusBadge = {
    DRAFT:          { label: t("badge_draft"),         cls: "bg-gray-100 text-gray-600" },
    PREPAID:        { label: t("badge_prepaid"),        cls: "bg-yellow-100 text-yellow-700" },
    OPEN:           { label: t("badge_awaiting_count"), cls: "bg-blue-100 text-blue-700" },
    PENDING_REVIEW: { label: t("badge_discrepancy"),    cls: "bg-orange-100 text-orange-700" },
    PARTIAL:        { label: t("badge_partial"),        cls: "bg-purple-100 text-purple-700" },
    COMPLETE:       { label: t("badge_complete"),       cls: "bg-green-100 text-green-700" },
  } as Record<string, { label: string; cls: string }>;

  const [session, delivery] = await Promise.all([
    getSession(),
    prisma.stockDelivery.findUniqueOrThrow({
      where: { id },
      include: {
        supplier: true,
        cashierEnteredBy: { select: { name: true } },
        counterEnteredBy: { select: { name: true } },
        resolvedBy: { select: { name: true } },
        createdBy: { select: { name: true } },
        parentDelivery: { select: { id: true, invoiceNo: true } },
        batches: { select: { id: true, invoiceNo: true, status: true, deliveryDate: true } },
        items: {
          include: { stockItem: { select: { name: true, unit: true } } },
          orderBy: { stockItem: { name: "asc" } },
        },
        logs: {
          include: { actor: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
  ]);

  const isCashier = session && hasAnyRole(session.roles, ["CASHIER", "MANAGER", "ADMIN"]);
  const isCounter = session && hasAnyRole(session.roles, ["WAITER", "KITCHEN", "MANAGER", "ADMIN"]);
  const isManager = session && hasAnyRole(session.roles, ["MANAGER", "ADMIN"]);

  const badge = statusBadge[delivery.status] ?? statusBadge.DRAFT;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800">
              {t("heading_delivery_prefix")} {delivery.invoiceNo ? `#${delivery.invoiceNo}` : `(${delivery.id.slice(-6)})`}
            </h2>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
              {badge.label}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-gray-500">
            {delivery.supplier?.name ?? t("label_no_supplier")} ·{" "}
            {formatDate(delivery.deliveryDate)} ·{" "}
            {t("label_created_by")} {delivery.createdBy.name}
          </p>
          {delivery.parentDelivery && (
            <p className="mt-0.5 text-xs text-purple-600">
              {t("label_batch_delivery_for")}{" "}
              <Link href={`/inventory/deliveries/${delivery.parentDelivery.id}`}
                className="underline">
                {delivery.parentDelivery.invoiceNo ?? delivery.parentDelivery.id.slice(-6)}
              </Link>
            </p>
          )}
        </div>
        <Link href="/inventory/deliveries" className="text-sm text-blue-600 hover:underline">
          {t("link_all_deliveries")}
        </Link>
      </div>

      {/* Two panels: cashier + counter */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Cashier panel */}
        <div className={`rounded-xl border-2 p-4 ${delivery.cashierSubmittedAt ? "border-green-300 bg-green-50" : "border-blue-200 bg-white"} shadow-sm`}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">{t("panel_invoice_cashier")}</h3>
            {delivery.cashierSubmittedAt ? (
              <span className="text-xs text-green-700">
                {t("label_submitted_by")} {delivery.cashierEnteredBy?.name} ·{" "}
                {new Date(delivery.cashierSubmittedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </span>
            ) : (
              <span className="text-xs text-gray-400">{t("panel_not_yet_submitted")}</span>
            )}
          </div>

          {delivery.cashierSubmittedAt ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500">
                  <th className="pb-1 text-left">{t("col_item")}</th>
                  <th className="pb-1 text-center">{t("col_ordered")}</th>
                  <th className="pb-1 text-center">{t("col_this_batch")}</th>
                  <th className="pb-1 text-right">{t("col_unit_cost")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {delivery.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-1 text-gray-700">{item.stockItem.name}</td>
                    <td className="py-1 text-center text-gray-600">
                      {item.orderedQty ?? "—"} <span className="text-xs text-gray-400">{UNIT_ABBR[item.stockItem.unit]}</span>
                    </td>
                    <td className="py-1 text-center font-medium">{item.cashierQty ?? "—"}</td>
                    <td className="py-1 text-right text-gray-600">
                      {item.unitCost != null ? `${item.unitCost.toLocaleString()} MMK` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : isCashier ? (
            <Link href={`/inventory/deliveries/${id}/cashier`}
              className="block rounded-lg bg-brand px-4 py-2 text-center text-sm font-semibold text-white hover:bg-brand-dark">
              {t("link_enter_invoice")}
            </Link>
          ) : (
            <p className="text-sm text-gray-400">{t("waiting_cashier")}</p>
          )}

          {delivery.totalCost != null && (
            <div className="mt-2 text-right text-sm font-semibold text-gray-700">
              {t("label_total")}: {delivery.totalCost.toLocaleString()} MMK
              {delivery.paymentStatus === "PREPAID" && (
                <span className="ml-2 text-xs text-yellow-600">
                  {delivery.prepaidAt
                    ? t("label_prepaid_on", { date: formatDate(delivery.prepaidAt) })
                    : t("label_prepaid_no_date")}
                </span>
              )}
            </div>
          )}

          {delivery.status === "DRAFT" && !delivery.cashierSubmittedAt && !delivery.expenseId && isCashier && (
            <p className="mt-2 text-xs text-gray-500">
              {t("goods_arriving_later")}{" "}
              <Link href={`/inventory/deliveries/${id}/cashier?mode=prepay`}
                className="text-yellow-600 underline">
                {t("link_record_prepayment")}
              </Link>
            </p>
          )}
        </div>

        {/* Counter panel */}
        <div className={`rounded-xl border-2 p-4 ${delivery.counterSubmittedAt ? "border-green-300 bg-green-50" : "border-orange-200 bg-white"} shadow-sm`}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">{t("panel_physical_count")}</h3>
            {delivery.counterSubmittedAt ? (
              <span className="text-xs text-green-700">
                {t("label_counted_by")} {delivery.counterEnteredBy?.name} ·{" "}
                {new Date(delivery.counterSubmittedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </span>
            ) : (
              <span className="text-xs text-gray-400">{t("panel_not_yet_submitted")}</span>
            )}
          </div>

          {delivery.counterSubmittedAt ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500">
                  <th className="pb-1 text-left">{t("col_item")}</th>
                  <th className="pb-1 text-center">{t("col_counted_inv")}</th>
                  {delivery.cashierSubmittedAt && (
                    <th className="pb-1 text-center">{t("col_match")}</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {delivery.items.map((item) => {
                  const match =
                    item.cashierQty != null && item.counterQty != null
                      ? item.cashierQty === item.counterQty
                      : null;
                  return (
                    <tr key={item.id}>
                      <td className="py-1 text-gray-700">{item.stockItem.name}</td>
                      <td className="py-1 text-center font-medium">{item.counterQty ?? "—"}</td>
                      {delivery.cashierSubmittedAt && (
                        <td className="py-1 text-center">
                          {match === true && <span className="text-green-600">✓</span>}
                          {match === false && (
                            <span className="text-red-600 font-bold">
                              {item.cashierQty} vs {item.counterQty}
                            </span>
                          )}
                          {match === null && <span className="text-gray-400">—</span>}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : isCounter ? (
            <div>
              {delivery.status === "PREPAID" && (
                <div className="mb-3 rounded bg-yellow-50 border border-yellow-200 px-3 py-2 text-xs text-yellow-700">
                  {t("hint_prepaid_count_notice")}
                </div>
              )}
              <Link href={`/inventory/deliveries/${id}/counter`}
                className="block rounded-lg bg-orange-500 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-orange-600">
                {t("link_count_items")}
              </Link>
            </div>
          ) : (
            <p className="text-sm text-gray-400">{t("waiting_counter")}</p>
          )}
        </div>
      </div>

      {/* Manager resolution */}
      {delivery.status === "PENDING_REVIEW" && isManager && (
        <section className="rounded-xl border-2 border-orange-300 bg-orange-50 p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-orange-800">{t("section_resolve_discrepancy")}</h3>
          <p className="mb-3 text-xs text-orange-700">{t("hint_resolve_discrepancy")}</p>
          <form action={resolveDelivery} className="space-y-3">
            <input type="hidden" name="deliveryId" value={id} />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-600">
                    <th className="pb-1 text-left">{t("col_item")}</th>
                    <th className="pb-1 text-center">{t("col_cashier")}</th>
                    <th className="pb-1 text-center">{t("col_counter")}</th>
                    <th className="pb-1 text-center">{t("col_final_qty")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-orange-100">
                  {delivery.items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-1 text-gray-700">{item.stockItem.name}</td>
                      <td className="py-1 text-center">{item.cashierQty ?? "—"}</td>
                      <td className="py-1 text-center">{item.counterQty ?? "—"}</td>
                      <td className="py-1 text-center">
                        <input
                          name={`final_${item.id}`}
                          type="number"
                          min="0"
                          defaultValue={item.cashierQty ?? item.counterQty ?? 0}
                          className="w-20 rounded border border-gray-300 px-2 py-0.5 text-center"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <textarea name="resolutionNote" placeholder={t("placeholder_resolution_note")}
              required rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" name="isPartial" className="rounded" />
              {t("checkbox_more_items_expected")}
            </label>
            <button type="submit"
              className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700">
              {t("btn_confirm_resolution")}
            </button>
          </form>
        </section>
      )}

      {/* Resolved info */}
      {delivery.resolvedBy && (
        <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
          {t("label_resolved_by")} <strong>{delivery.resolvedBy.name}</strong>
          {delivery.resolvedAt && ` ${t("label_on")} ${formatDate(delivery.resolvedAt)}`}
          {delivery.resolutionNote && ` — "${delivery.resolutionNote}"`}
        </div>
      )}

      {/* Follow-up batch link */}
      {(delivery.status === "PARTIAL" || delivery.status === "COMPLETE") && (
        <div className="flex items-center gap-3">
          {delivery.batches.length > 0 && (
            <div className="rounded-lg bg-purple-50 px-3 py-2 text-sm text-purple-700">
              {t("label_batch_deliveries")}{" "}
              {delivery.batches.map((b, i) => (
                <span key={b.id}>
                  {i > 0 && ", "}
                  <Link href={`/inventory/deliveries/${b.id}`} className="underline">
                    {b.invoiceNo ?? b.id.slice(-6)} ({statusBadge[b.status]?.label ?? b.status})
                  </Link>
                </span>
              ))}
            </div>
          )}
          {delivery.status === "PARTIAL" && (
            <Link href={`/inventory/deliveries/new?parentId=${id}`}
              className="rounded-lg bg-purple-600 px-3 py-2 text-sm font-semibold text-white hover:bg-purple-700">
              {t("btn_add_next_batch")}
            </Link>
          )}
        </div>
      )}

      {/* Audit log */}
      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">{t("section_activity_log")}</h3>
        <ol className="space-y-1.5">
          {delivery.logs.map((log) => (
            <li key={log.id} className="flex items-start gap-2 text-xs text-gray-600">
              <span className="mt-0.5 flex-shrink-0 rounded bg-gray-100 px-1.5 py-0.5 font-mono">
                {new Date(log.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span>
                <strong>{log.actor.name}</strong> — {log.action.replace(/_/g, " ").toLowerCase()}
                {log.note && <span className="text-gray-400"> ({log.note})</span>}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
