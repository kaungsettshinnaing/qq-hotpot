import { prisma } from "@/lib/db";
import SubmitButton from "@/components/SubmitButton";
import { createStockItem, updateStockItem, toggleStockItem } from "./actions";

export const dynamic = "force-dynamic";

const UNITS = ["UNIT", "GRAM", "KG", "LITRE", "BOX", "BOTTLE", "PACK"] as const;

const UNIT_LABEL: Record<string, string> = {
  UNIT: "Unit", GRAM: "Gram", KG: "KG", LITRE: "Litre", BOX: "Box", BOTTLE: "Bottle", PACK: "Pack",
};

export default async function StockItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const { edit } = await searchParams;
  const items = await prisma.stockItem.findMany({ orderBy: { name: "asc" } });
  const editing = edit ? items.find((i) => i.id === edit) : null;

  // Compute current stock for each item
  const movements = await prisma.stockMovement.groupBy({
    by: ["stockItemId"],
    _sum: { qty: true },
  });
  const stockMap = new Map(movements.map((m) => [m.stockItemId, m._sum.qty ?? 0]));

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <section className="rounded-xl bg-white shadow-sm">
          <h3 className="border-b border-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">
            Stock items ({items.length})
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500">
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-center font-medium">Unit</th>
                <th className="px-4 py-2 text-center font-medium">Stock</th>
                <th className="px-4 py-2 text-center font-medium">Min / Optimal</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-gray-400">No stock items yet.</td>
                </tr>
              )}
              {items.map((item) => {
                const current = stockMap.get(item.id) ?? 0;
                const isLow = item.minStock != null && current <= item.minStock;
                const isOk = item.optimalStock != null && current >= item.optimalStock;
                const stockColor = isLow ? "text-red-600 font-bold" : isOk ? "text-green-600" : "text-yellow-600";
                return (
                  <tr key={item.id}>
                    <td className="px-4 py-2">
                      <span className={item.isActive ? "font-medium" : "font-medium text-gray-400 line-through"}>
                        {item.name}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center text-gray-500">{UNIT_LABEL[item.unit]}</td>
                    <td className={`px-4 py-2 text-center ${stockColor}`}>{current}</td>
                    <td className="px-4 py-2 text-center text-gray-500">
                      {item.minStock ?? "—"} / {item.optimalStock ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right space-x-2">
                      <a href={`/admin/stock-items?edit=${item.id}`} className="text-xs text-blue-600 hover:underline">
                        Edit
                      </a>
                      <form action={toggleStockItem} className="inline">
                        <input type="hidden" name="id" value={item.id} />
                        <button className="text-xs text-gray-500 hover:underline">
                          {item.isActive ? "Hide" : "Show"}
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>

      <div className="space-y-4">
        {editing && (
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-700">Edit: {editing.name}</h3>
            <form action={updateStockItem} className="space-y-2 text-sm">
              <input type="hidden" name="id" value={editing.id} />
              <input name="name" required defaultValue={editing.name}
                className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              <select name="unit" defaultValue={editing.unit}
                className="w-full rounded-lg border border-gray-300 px-3 py-2">
                {UNITS.map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}
              </select>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-gray-500">Min stock</label>
                  <input name="minStock" type="number" min="0" defaultValue={editing.minStock ?? ""}
                    placeholder="None" className="w-full rounded-lg border border-gray-300 px-3 py-1.5" />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-500">Optimal stock</label>
                  <input name="optimalStock" type="number" min="0" defaultValue={editing.optimalStock ?? ""}
                    placeholder="None" className="w-full rounded-lg border border-gray-300 px-3 py-1.5" />
                </div>
              </div>
              <div className="flex gap-2">
                <SubmitButton className="flex-1 rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
                  Save
                </SubmitButton>
                <a href="/admin/stock-items"
                  className="flex-1 rounded-lg border border-gray-300 py-2 text-center text-sm text-gray-600 hover:bg-gray-50">
                  Cancel
                </a>
              </div>
            </form>
          </section>
        )}

        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">Add stock item</h3>
          <form action={createStockItem} className="space-y-2 text-sm">
            <input name="name" required placeholder="Item name (e.g. Dagon Beer Bottle)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2" />
            <select name="unit" className="w-full rounded-lg border border-gray-300 px-3 py-2">
              {UNITS.map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}
            </select>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-gray-500">Min stock (alert)</label>
                <input name="minStock" type="number" min="0" placeholder="None"
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5" />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500">Optimal stock</label>
                <input name="optimalStock" type="number" min="0" placeholder="None"
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5" />
              </div>
            </div>
            <SubmitButton className="w-full rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
              Add item
            </SubmitButton>
          </form>
        </section>
      </div>
    </div>
  );
}
