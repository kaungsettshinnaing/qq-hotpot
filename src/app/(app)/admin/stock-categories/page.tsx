import { prisma } from "@/lib/db";
import SubmitButton from "@/components/SubmitButton";
import { createStockCategory, updateStockCategory, toggleStockCategory } from "./actions";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

export default async function StockCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const t = await getT();
  const { edit } = await searchParams;
  const categories = await prisma.stockCategory.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { items: true } } },
  });
  const editing = edit ? categories.find((c) => c.id === edit) : null;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <section className="rounded-xl bg-white shadow-sm">
          <h3 className="border-b border-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">
            {t("admin_card_stock_categories_label")} ({categories.length})
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500">
                <th className="px-4 py-2 text-left font-medium">{t("col_name")}</th>
                <th className="px-4 py-2 text-center font-medium">{t("col_items")}</th>
                <th className="px-4 py-2 text-right font-medium">{t("col_actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {categories.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-gray-400">{t("empty_no_stock_categories")}</td>
                </tr>
              )}
              {categories.map((cat) => (
                <tr key={cat.id}>
                  <td className="px-4 py-2">
                    <span className={cat.isActive ? "font-medium" : "font-medium text-gray-400 line-through"}>
                      {cat.name}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center text-gray-500">{cat._count.items}</td>
                  <td className="px-4 py-2 text-right space-x-2">
                    <a href={`/admin/stock-categories?edit=${cat.id}`} className="text-xs text-blue-600 hover:underline">
                      {t("btn_edit")}
                    </a>
                    <form action={toggleStockCategory} className="inline">
                      <input type="hidden" name="id" value={cat.id} />
                      <button className="text-xs text-gray-500 hover:underline">
                        {cat.isActive ? t("btn_hide") : t("btn_show")}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
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
            <form action={updateStockCategory} className="space-y-2 text-sm">
              <input type="hidden" name="id" value={editing.id} />
              <input name="name" required defaultValue={editing.name}
                className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              <div className="flex gap-2">
                <SubmitButton className="flex-1 rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
                  {t("btn_save")}
                </SubmitButton>
                <a href="/admin/stock-categories"
                  className="flex-1 rounded-lg border border-gray-300 py-2 text-center text-sm text-gray-600 hover:bg-gray-50">
                  {t("btn_cancel")}
                </a>
              </div>
            </form>
          </section>
        )}

        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">{t("heading_add_stock_category")}</h3>
          <form action={createStockCategory} className="space-y-2 text-sm">
            <input name="name" required placeholder="e.g. Pork, Beverages, Vegetables"
              className="w-full rounded-lg border border-gray-300 px-3 py-2" />
            <SubmitButton className="w-full rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
              {t("btn_add")}
            </SubmitButton>
          </form>
        </section>
      </div>
    </div>
  );
}
