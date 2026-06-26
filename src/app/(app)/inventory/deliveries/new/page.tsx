import { prisma } from "@/lib/db";
import SubmitButton from "@/components/SubmitButton";
import { createDelivery } from "../[id]/actions";

export const dynamic = "force-dynamic";

export default async function NewDeliveryPage({
  searchParams,
}: {
  searchParams: Promise<{ parentId?: string }>;
}) {
  const { parentId } = await searchParams;
  const [suppliers, parent] = await Promise.all([
    prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    parentId ? prisma.stockDelivery.findUnique({
      where: { id: parentId },
      include: { supplier: true },
    }) : Promise.resolve(null),
  ]);

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="mx-auto max-w-lg">
      <h2 className="mb-4 text-base font-semibold text-gray-800">
        {parent ? `New Batch Delivery (follows ${parent.invoiceNo ?? parent.id.slice(-6)})` : "New Delivery"}
      </h2>

      {parent && (
        <div className="mb-4 rounded-lg bg-purple-50 border border-purple-200 px-4 py-3 text-sm text-purple-800">
          This is a follow-up batch for a partial delivery from{" "}
          <strong>{parent.supplier?.name ?? "unknown supplier"}</strong>.
          Items and quantities from this batch will be counted separately.
        </div>
      )}

      <section className="rounded-xl bg-white p-5 shadow-sm">
        <form action={createDelivery} className="space-y-4 text-sm">
          {parentId && <input type="hidden" name="parentId" value={parentId} />}

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Supplier</label>
            <select name="supplierId"
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
              defaultValue={parent?.supplierId ?? ""}>
              <option value="">— No supplier / unknown —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Delivery date</label>
            <input name="deliveryDate" type="date" required defaultValue={today}
              className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Invoice / reference number</label>
            <input name="invoiceNo" placeholder="e.g. INV-2024-001 (optional)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </div>

          <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500 space-y-1">
            <p>After creating the delivery header, you will be taken to the detail page where:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Cashier enters invoice quantities + costs</li>
              <li>Waiter/Kitchen enters the physical count (blind)</li>
            </ul>
            <p>Either side can go first.</p>
          </div>

          <SubmitButton className="w-full rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
            Create delivery
          </SubmitButton>
        </form>
      </section>
    </div>
  );
}
