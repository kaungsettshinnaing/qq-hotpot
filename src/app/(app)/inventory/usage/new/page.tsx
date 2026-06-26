import { prisma } from "@/lib/db";
import { requireAnyRole } from "@/lib/auth";
import SubmitButton from "@/components/SubmitButton";
import { recordUsage } from "../actions";

export const dynamic = "force-dynamic";

const UNIT_LABEL: Record<string, string> = {
  UNIT: "Unit", GRAM: "Gram", KG: "KG", LITRE: "Litre", BOX: "Box", BOTTLE: "Bottle", PACK: "Pack",
};

export default async function NewUsagePage() {
  await requireAnyRole(["WAITER", "KITCHEN", "MANAGER", "ADMIN"]);

  const stockItems = await prisma.stockItem.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800">Record Stock Usage</h2>
        <a href="/inventory/usage" className="text-sm text-blue-600 hover:underline">Cancel</a>
      </div>

      <section className="rounded-xl bg-white p-5 shadow-sm">
        <form action={recordUsage} className="space-y-4 text-sm">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Item</label>
            <select name="stockItemId" required
              className="w-full rounded-lg border border-gray-300 px-3 py-2">
              <option value="">— Select item —</option>
              {stockItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({UNIT_LABEL[item.unit]})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Quantity used</label>
            <input name="qty" type="number" min="1" required placeholder="0"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-lg font-semibold" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Note (optional)</label>
            <input name="note" placeholder="e.g. Pulled for dinner service"
              className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </div>

          <SubmitButton className="w-full rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
            Record usage
          </SubmitButton>
        </form>
      </section>
    </div>
  );
}
