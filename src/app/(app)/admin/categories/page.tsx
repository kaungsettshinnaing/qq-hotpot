import { prisma } from "@/lib/db";
import SubmitButton from "@/components/SubmitButton";
import { createCategory, toggleCategory } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminCategoriesPage() {
  const categories = await prisma.expenseCategory.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <section className="rounded-xl bg-white shadow-sm">
          <h3 className="border-b border-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">
            Expense categories ({categories.length})
          </h3>
          <ul className="divide-y divide-gray-100">
            {categories.length === 0 && (
              <li className="px-4 py-3 text-sm text-gray-400">No categories yet.</li>
            )}
            {categories.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className={c.isActive ? "font-medium" : "font-medium text-gray-400 line-through"}>
                  {c.name}
                </span>
                <form action={toggleCategory}>
                  <input type="hidden" name="id" value={c.id} />
                  <button className="text-xs text-gray-500 hover:underline">
                    {c.isActive ? "Hide" : "Show"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">Add category</h3>
        <form action={createCategory} className="space-y-2 text-sm">
          <input
            name="name"
            required
            placeholder="Category name"
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
          <SubmitButton className="w-full rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
            Add category
          </SubmitButton>
        </form>
      </section>
    </div>
  );
}
