import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAnyRole } from "@/lib/auth";
import SubmitButton from "@/components/SubmitButton";
import { submitCashierSide, recordPrepayment } from "../actions";

export const dynamic = "force-dynamic";

export default async function CashierEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  await requireAnyRole(["CASHIER", "MANAGER", "ADMIN"]);
  const { id } = await params;
  const { mode } = await searchParams;
  const isPrepay = mode === "prepay";

  const delivery = await prisma.stockDelivery.findUniqueOrThrow({
    where: { id },
    include: {
      supplier: true,
      items: { include: { stockItem: { select: { name: true, unit: true } } } },
    },
  });

  if (delivery.cashierSubmittedAt && !isPrepay) {
    redirect(`/inventory/deliveries/${id}`);
  }

  const [stockItems, categories] = await Promise.all([
    prisma.stockItem.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.expenseCategory.findMany({ where: { isActive: true, isStock: true }, orderBy: { name: "asc" } }),
  ]);

  const UNIT_LABEL: Record<string, string> = {
    UNIT: "Unit", GRAM: "Gram", KG: "KG", LITRE: "Litre", BOX: "Box", BOTTLE: "Bottle", PACK: "Pack",
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800">
          {isPrepay ? "Record Pre-payment" : "Enter Invoice"} —{" "}
          {delivery.invoiceNo ? `#${delivery.invoiceNo}` : `Delivery ${id.slice(-6)}`}
        </h2>
        <a href={`/inventory/deliveries/${id}`} className="text-sm text-blue-600 hover:underline">Cancel</a>
      </div>

      {isPrepay && (
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-800">
          <strong>Pre-payment:</strong> Record payment now. Goods will be received later. The expense will be
          created immediately, and the delivery will stay as &quot;Pre-paid&quot; until items arrive.
        </div>
      )}

      {isPrepay ? (
        /* Pre-payment form (total amount only, no line items) */
        <section className="rounded-xl bg-white p-5 shadow-sm">
          <form action={recordPrepayment} className="space-y-4 text-sm">
            <input type="hidden" name="id" value={id} />
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Total paid amount (MMK)</label>
              <input name="totalCost" type="number" min="1" required placeholder="0"
                className="w-full rounded-lg border border-gray-300 px-3 py-2" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Expense category</label>
              <select name="categoryId" required className="w-full rounded-lg border border-gray-300 px-3 py-2">
                <option value="">— Select category —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Payment method</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="paymentSource" value="CASH_DRAWER" defaultChecked /> Cash drawer
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="paymentSource" value="BANK_TRANSFER" /> Bank transfer
                </label>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Description</label>
              <input name="description" placeholder="e.g. Advance payment for beer order" maxLength={300}
                className="w-full rounded-lg border border-gray-300 px-3 py-2" />
            </div>
            <SubmitButton className="w-full rounded-lg bg-yellow-500 py-2 font-semibold text-white hover:bg-yellow-600 disabled:opacity-60">
              Record pre-payment
            </SubmitButton>
          </form>
        </section>
      ) : (
        /* Normal invoice entry with line items */
        <section className="rounded-xl bg-white p-5 shadow-sm">
          <form action={submitCashierSide} className="space-y-5 text-sm">
            <input type="hidden" name="deliveryId" value={id} />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Expense category</label>
                <select name="categoryId" required className="w-full rounded-lg border border-gray-300 px-3 py-2">
                  <option value="">— Select —</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Payment method</label>
                <div className="flex gap-4 pt-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="paymentSource" value="CASH_DRAWER" defaultChecked /> Cash
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="paymentSource" value="BANK_TRANSFER" /> Bank
                  </label>
                </div>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Description / note</label>
              <input name="description" placeholder="e.g. Weekly grocery delivery" maxLength={300}
                className="w-full rounded-lg border border-gray-300 px-3 py-2" />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Line items from invoice</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs text-gray-500">
                      <th className="pb-2 text-left font-medium">Item</th>
                      <th className="pb-2 text-center font-medium">Ordered qty</th>
                      <th className="pb-2 text-center font-medium">This batch</th>
                      <th className="pb-2 text-right font-medium">Unit cost (MMK)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {stockItems.map((item) => {
                      const existing = delivery.items.find((di) => di.stockItemId === item.id);
                      return (
                        <tr key={item.id}>
                          <td className="py-2">
                            <input type="hidden" name="itemId" value={item.id} />
                            <span className="text-gray-700">{item.name}</span>
                            <span className="ml-1 text-xs text-gray-400">({UNIT_LABEL[item.unit]})</span>
                          </td>
                          <td className="py-2 text-center">
                            <input name="orderedQty" type="number" min="0" placeholder="—"
                              defaultValue={existing?.orderedQty ?? ""}
                              className="w-20 rounded border border-gray-200 px-2 py-1 text-center text-sm" />
                          </td>
                          <td className="py-2 text-center">
                            <input name="cashierQty" type="number" min="0" placeholder="0"
                              defaultValue={existing?.cashierQty ?? ""}
                              className="w-20 rounded border border-gray-200 px-2 py-1 text-center text-sm" />
                          </td>
                          <td className="py-2 text-right">
                            <input name="unitCost" type="number" min="0" placeholder="0"
                              defaultValue={existing?.unitCost ?? ""}
                              className="w-24 rounded border border-gray-200 px-2 py-1 text-right text-sm" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-gray-400">
                Leave qty as 0 for items not in this delivery. Ordered qty = total on purchase order (can span batches).
              </p>
            </div>

            <SubmitButton className="w-full rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
              Submit invoice
            </SubmitButton>
          </form>
        </section>
      )}
    </div>
  );
}
