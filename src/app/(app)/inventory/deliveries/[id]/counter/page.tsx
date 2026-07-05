import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAnyRole } from "@/lib/auth";
import SubmitButton from "@/components/SubmitButton";
import { submitCounterSide } from "../actions";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

export default async function CounterEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAnyRole(["WAITER", "KITCHEN", "MANAGER", "ADMIN"]);
  const { id } = await params;
  const t = await getT();

  const delivery = await prisma.stockDelivery.findUniqueOrThrow({
    where: { id },
    include: {
      supplier: true,
      items: {
        where: { stockItemId: { not: null } },
        include: { stockItem: { select: { name: true, unit: true } } },
      },
    },
  });

  if (delivery.counterSubmittedAt || delivery.invoiceType === "NON_STOCK") {
    redirect(`/inventory/deliveries/${id}`);
  }

  // Invoice-first: the physical count is always against the entered invoice.
  const invoiceEntered = !!delivery.cashierSubmittedAt;

  const items = delivery.items
    .filter((di) => di.stockItemId != null && di.stockItem != null)
    .map((di) => ({ id: di.stockItemId!, name: di.stockItem!.name, unit: di.stockItem!.unit }));

  const UNIT_LABEL: Record<string, string> = {
    UNIT: "Unit", GRAM: "Gram", KG: "KG", LITRE: "Litre", BOX: "Box", BOTTLE: "Bottle", PACK: "Pack",
  };

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800">{t("heading_count_received")}</h2>
        <a href={`/inventory/deliveries/${id}`} className="text-sm text-blue-600 hover:underline">{t("btn_cancel")}</a>
      </div>

      {!invoiceEntered ? (
        <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-6 text-center text-sm text-gray-500">
          {t("waiting_for_invoice")}
        </div>
      ) : (
      <>
      <div className="rounded-lg bg-orange-50 border border-orange-200 px-4 py-3 text-sm text-orange-800">
        <strong>{t("blind_count_notice")}</strong>
        {delivery.supplier && <> {t("col_supplier")}: <strong>{delivery.supplier.name}</strong>.</>}
      </div>

      <section className="rounded-xl bg-white p-5 shadow-sm">
        <form action={submitCounterSide} className="space-y-4 text-sm">
          <input type="hidden" name="deliveryId" value={id} />

          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2">
                <div>
                  <input type="hidden" name="itemId" value={item.id} />
                  <p className="font-medium text-gray-800">{item.name}</p>
                  <p className="text-xs text-gray-400">{UNIT_LABEL[item.unit]}</p>
                </div>
                <input
                  name="counterQty"
                  type="number"
                  min="0"
                  required
                  placeholder="0"
                  className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-center text-lg font-semibold"
                />
              </div>
            ))}
          </div>

          {items.length === 0 && (
            <p className="text-center text-gray-400 py-4">
              {t("empty_no_stock_to_count")}
            </p>
          )}

          <p className="text-xs text-gray-400">{t("count_submit_note")}</p>

          {items.length > 0 && (
            <SubmitButton className="w-full rounded-lg bg-orange-500 py-2 font-semibold text-white hover:bg-orange-600 disabled:opacity-60">
              {t("btn_submit_count")}
            </SubmitButton>
          )}
        </form>
      </section>
      </>
      )}
    </div>
  );
}
