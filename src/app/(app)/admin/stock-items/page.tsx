import { prisma } from "@/lib/db";
import SubmitButton from "@/components/SubmitButton";
import { createStockItem, updateStockItem, toggleStockItem } from "./actions";
import { getT } from "@/lib/lang";

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
  const t = await getT();
  const { edit } = await searchParams;
  const [items, categories] = await Promise.all([
    prisma.stockItem.findMany({
      orderBy: { name: "asc" },
      include: { category: { select: { id: true, name: true } } },
    }),
    prisma.stockCategory.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);
  const editing = edit ? items.find((i) => i.id === edit) : null;

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
            {t("admin_card_stock_items_label")} ({items.length})
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500">
                <th className="px-4 py-2 text-left font-medium">{t("col_name")}</th>
                <th className="px-4 py-2 text-left font-medium">{t("label_category")}</th>
                <th className="px-4 py-2 text-center font-medium">{t("label_unit")}</th>
                <th className="px-4 py-2 text-center font-medium">{t("col_stock_level")}</th>
                <th className="px-4 py-2 text-center font-medium">{t("col_min_optimal")}</th>
                <th className="px-4 py-2 text-right font-medium">{t("col_actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-3 text-gray-400">{t("empty_no_stock_items")}</td>
                </tr>
              )}
              {items.map((item) => {
                const current = stockMap.get(item.id) ?? 0;
                const isLow = item.minStock != null && current <= item.minStock;
                const isOk  = item.optimalStock != null && current >= item.optimalStock;
                const stockColor = isLow ? "text-red-600 font-bold" : isOk ? "text-green-600" : "text-yellow-600";
                return (
                  <tr key={item.id}>
                    <td className="px-4 py-2">
                      <span className={item.isActive ? "font-medium" : "font-medium text-gray-400 line-through"}>
                        {item.name}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500">
                      {item.category?.name ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2 text-center text-gray-500">{UNIT_LABEL[item.unit]}</td>
                    <td className={`px-4 py-2 text-center ${stockColor}`}>{current}</td>
                    <td className="px-4 py-2 text-center text-gray-500">
                      {item.minStock ?? "—"} / {item.optimalStock ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right space-x-2">
                      <a href={`/admin/stock-items?edit=${item.id}`} className="text-xs text-blue-600 hover:underline">
                        {t("btn_edit")}
                      </a>
                      <form action={toggleStockItem} className="inline">
                        <input type="hidden" name="id" value={item.id} />
                        <button className="text-xs text-gray-500 hover:underline">
                          {item.isActive ? t("btn_hide") : t("btn_show")}
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
            <h3 className="mb-3 text-sm font-semibold text-gray-700">
              {t("label_edit_prefix")} {editing.name}
            </h3>
            <form action={updateStockItem} className="space-y-2 text-sm">
              <input type="hidden" name="id" value={editing.id} />
              <input name="name" required defaultValue={editing.name}
                className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              <select name="categoryId" defaultValue={editing.categoryId ?? ""}
                className="w-full rounded-lg border border-gray-300 px-3 py-2">
                <option value="">— {t("label_category")} (optional) —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select name="unit" defaultValue={editing.unit}
                className="w-full rounded-lg border border-gray-300 px-3 py-2">
                {UNITS.map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}
              </select>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-gray-500">{t("label_min_stock")}</label>
                  <input name="minStock" type="number" min="0" defaultValue={editing.minStock ?? ""}
                    placeholder={t("placeholder_none")}
                    className="w-full rounded-lg border border-gray-300 px-3 py-1.5" />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-500">{t("label_optimal_stock")}</label>
                  <input name="optimalStock" type="number" min="0" defaultValue={editing.optimalStock ?? ""}
                    placeholder={t("placeholder_none")}
                    className="w-full rounded-lg border border-gray-300 px-3 py-1.5" />
                </div>
              </div>
              <div className="flex gap-2">
                <SubmitButton className="flex-1 rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
                  {t("btn_save")}
                </SubmitButton>
                <a href="/admin/stock-items"
                  className="flex-1 rounded-lg border border-gray-300 py-2 text-center text-sm text-gray-600 hover:bg-gray-50">
                  {t("btn_cancel")}
                </a>
              </div>
            </form>
          </section>
        )}

        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">{t("heading_add_stock_item")}</h3>
          <form action={createStockItem} className="space-y-2 text-sm">
            <input name="name" required placeholder="e.g. Pork Meat"
              className="w-full rounded-lg border border-gray-300 px-3 py-2" />
            <select name="categoryId" className="w-full rounded-lg border border-gray-300 px-3 py-2">
              <option value="">— {t("label_category")} (optional) —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select name="unit" className="w-full rounded-lg border border-gray-300 px-3 py-2">
              {UNITS.map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}
            </select>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-gray-500">{t("label_min_stock_alert")}</label>
                <input name="minStock" type="number" min="0" placeholder={t("placeholder_none")}
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5" />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500">{t("label_optimal_stock")}</label>
                <input name="optimalStock" type="number" min="0" placeholder={t("placeholder_none")}
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5" />
              </div>
            </div>
            <SubmitButton className="w-full rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
              {t("btn_add_item")}
            </SubmitButton>
          </form>
        </section>
      </div>
    </div>
  );
}
