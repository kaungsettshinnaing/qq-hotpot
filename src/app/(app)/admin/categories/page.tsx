import { prisma } from "@/lib/db";
import SubmitButton from "@/components/SubmitButton";
import { createCategory, toggleCategory, toggleCategoryStock } from "../actions";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

export default async function AdminCategoriesPage() {
  const t = await getT();
  const categories = await prisma.expenseCategory.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <section className="rounded-xl bg-white shadow-sm">
          <h3 className="border-b border-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">
            {t("admin_card_expense_categories_label")} ({categories.length})
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500">
                <th className="px-4 py-2 text-left font-medium">{t("col_name")}</th>
                <th className="px-4 py-2 text-center font-medium">{t("col_stock")}</th>
                <th className="px-4 py-2 text-center font-medium">Items</th>
                <th className="px-4 py-2 text-right font-medium">{t("col_visibility")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {categories.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-gray-400">{t("empty_no_categories")}</td>
                </tr>
              )}
              {categories.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2">
                    <span className={c.isActive ? "font-medium" : "font-medium text-gray-400 line-through"}>
                      {c.name}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <form action={toggleCategoryStock} className="inline">
                      <input type="hidden" name="id" value={c.id} />
                      <button
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          c.isStock
                            ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        }`}
                      >
                        {c.isStock ? t("col_stock_level") : t("label_non_stock")}
                      </button>
                    </form>
                  </td>
                  <td className="px-4 py-2 text-center">
                    {c.isStock && (
                      <a href={`/admin/categories/${c.id}`} className="text-xs text-blue-600 hover:underline">
                        Configure
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <form action={toggleCategory} className="inline">
                      <input type="hidden" name="id" value={c.id} />
                      <button className="text-xs text-gray-500 hover:underline">
                        {c.isActive ? t("btn_hide") : t("btn_show")}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">{t("btn_add_category")}</h3>
        <form action={createCategory} className="space-y-2 text-sm">
          <input
            name="name"
            required
            placeholder={t("placeholder_category_name")}
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" name="isStock" className="rounded" />
            {t("checkbox_linked_to_stock")}
          </label>
          <SubmitButton className="w-full rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
            {t("btn_add_category")}
          </SubmitButton>
        </form>
        <p className="mt-3 text-xs text-gray-400">{t("hint_stock_category")}</p>
      </section>
    </div>
  );
}
