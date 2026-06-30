import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requireAnyRole } from "@/lib/auth";
import SubmitButton from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

async function addItem(fd: FormData) {
  "use server";
  await requireAnyRole(["ADMIN"]);
  const categoryId = fd.get("categoryId") as string;
  const name = (fd.get("name") as string).trim();
  const defaultUnit = ((fd.get("defaultUnit") as string) ?? "").trim() || null;
  if (!name) return;
  await prisma.expenseCategoryItem.create({
    data: { categoryId, name, defaultUnit },
  });
  revalidatePath(`/admin/categories/${categoryId}`);
}

async function toggleItem(fd: FormData) {
  "use server";
  await requireAnyRole(["ADMIN"]);
  const id = fd.get("id") as string;
  const categoryId = fd.get("categoryId") as string;
  const item = await prisma.expenseCategoryItem.findUnique({ where: { id } });
  if (!item) return;
  await prisma.expenseCategoryItem.update({ where: { id }, data: { isActive: !item.isActive } });
  revalidatePath(`/admin/categories/${categoryId}`);
}

async function deleteItem(fd: FormData) {
  "use server";
  await requireAnyRole(["ADMIN"]);
  const id = fd.get("id") as string;
  const categoryId = fd.get("categoryId") as string;
  await prisma.expenseCategoryItem.delete({ where: { id } });
  revalidatePath(`/admin/categories/${categoryId}`);
}

export default async function CategoryItemsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAnyRole(["ADMIN"]);
  const { id } = await params;

  const category = await prisma.expenseCategory.findUnique({
    where: { id },
    include: { items: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
  });
  if (!category) notFound();

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div className="flex items-center gap-3">
        <a href="/admin/categories" className="text-sm text-brand hover:underline">
          ← Expense Categories
        </a>
        <h2 className="text-base font-semibold text-gray-800">
          {category.name} — Dropdown Items
        </h2>
        {category.isStock && (
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
            Stock
          </span>
        )}
      </div>

      {!category.isStock && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          This category is not marked as Stock. Items configured here will only appear as
          description dropdowns when the category is set to Stock type.
        </div>
      )}

      {/* Existing items */}
      <section className="rounded-xl bg-white shadow-sm">
        <h3 className="border-b border-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">
          Configured Items ({category.items.length})
        </h3>
        {category.items.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-400">No items yet. Add one below.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500">
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-left font-medium">Default Unit</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {category.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-2">
                    <span className={item.isActive ? "font-medium" : "text-gray-400 line-through"}>
                      {item.name}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-500 text-xs">{item.defaultUnit ?? "—"}</td>
                  <td className="px-4 py-2 text-right space-x-3">
                    <form action={toggleItem} className="inline">
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="categoryId" value={id} />
                      <button className="text-xs text-gray-500 hover:underline">
                        {item.isActive ? "Hide" : "Show"}
                      </button>
                    </form>
                    <form action={deleteItem} className="inline"
                      onSubmit={(e) => { if (!confirm("Delete this item?")) e.preventDefault(); }}>
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="categoryId" value={id} />
                      <button className="text-xs text-red-500 hover:underline">Delete</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Add new item */}
      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">Add Item</h3>
        <form action={addItem} className="space-y-2 text-sm">
          <input type="hidden" name="categoryId" value={id} />
          <div className="grid grid-cols-2 gap-2">
            <input
              name="name"
              required
              placeholder="Item name (e.g. Pork Belly)"
              className="col-span-2 rounded-lg border border-gray-300 px-3 py-2"
            />
            <input
              name="defaultUnit"
              placeholder="Default unit (e.g. kg, box)"
              className="rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>
          <SubmitButton className="w-full rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
            Add Item
          </SubmitButton>
        </form>
      </section>
    </div>
  );
}
