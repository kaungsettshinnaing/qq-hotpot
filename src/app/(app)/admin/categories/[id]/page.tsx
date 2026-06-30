import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requireAnyRole } from "@/lib/auth";
import SubmitButton from "@/components/SubmitButton";
import type { StockUnit } from "@prisma/client";

export const dynamic = "force-dynamic";

const UNITS: StockUnit[] = ["UNIT", "GRAM", "KG", "LITRE", "BOX", "BOTTLE", "PACK"];
const UNIT_LABEL: Record<StockUnit, string> = {
  UNIT: "Unit", GRAM: "Gram", KG: "KG", LITRE: "Litre", BOX: "Box", BOTTLE: "Bottle", PACK: "Pack",
};
const UNIT_ABBR: Record<StockUnit, string> = {
  UNIT: "unit", GRAM: "g", KG: "kg", LITRE: "L", BOX: "box", BOTTLE: "btl", PACK: "pack",
};

function parseUnit(v: unknown): StockUnit {
  const s = String(v ?? "").toUpperCase();
  return (UNITS as string[]).includes(s) ? (s as StockUnit) : "UNIT";
}

// ── Ensure a matching StockCategory and StockItem exist ────────────────────

async function upsertStockItem(params: {
  categoryName: string;
  itemId: string;
  name: string;
  unit: StockUnit;
  minStock: number | null;
  optimalStock: number | null;
}): Promise<string> {
  // Find or create the matching StockCategory by name
  let stockCat = await prisma.stockCategory.findFirst({ where: { name: params.categoryName } });
  if (!stockCat) {
    stockCat = await prisma.stockCategory.create({ data: { name: params.categoryName } });
  }

  // Find an existing linked StockItem via the categoryItem's stockItemId
  const existing = await prisma.expenseCategoryItem.findUnique({
    where: { id: params.itemId },
    select: { stockItemId: true },
  });

  if (existing?.stockItemId) {
    await prisma.stockItem.update({
      where: { id: existing.stockItemId },
      data: { name: params.name, unit: params.unit, minStock: params.minStock, optimalStock: params.optimalStock },
    });
    return existing.stockItemId;
  }

  // No linked StockItem yet — create one
  const stockItem = await prisma.stockItem.create({
    data: {
      name: params.name,
      categoryId: stockCat.id,
      unit: params.unit,
      minStock: params.minStock,
      optimalStock: params.optimalStock,
    },
  });
  return stockItem.id;
}

// ── Server actions ─────────────────────────────────────────────────────────

async function addItem(fd: FormData) {
  "use server";
  await requireAnyRole(["ADMIN"]);
  const categoryId = fd.get("categoryId") as string;
  const name = (fd.get("name") as string).trim();
  const defaultUnit = ((fd.get("defaultUnit") as string) ?? "").trim() || null;
  if (!name) return;

  const category = await prisma.expenseCategory.findUnique({ where: { id: categoryId } });
  if (!category) return;

  const optInt = (v: unknown) => { const n = parseInt(String(v ?? ""), 10); return Number.isNaN(n) || n < 0 ? null : n; };
  const stockUnit = category.isStock ? parseUnit(fd.get("stockUnit")) : null;
  const minStock  = category.isStock ? optInt(fd.get("minStock"))  : null;
  const optStock  = category.isStock ? optInt(fd.get("optimalStock")) : null;

  const item = await prisma.expenseCategoryItem.create({
    data: { categoryId, name, defaultUnit, stockUnit, minStock, optimalStock: optStock },
  });

  if (category.isStock) {
    const stockItemId = await upsertStockItem({
      categoryName: category.name,
      itemId: item.id,
      name,
      unit: stockUnit!,
      minStock,
      optimalStock: optStock,
    });
    await prisma.expenseCategoryItem.update({ where: { id: item.id }, data: { stockItemId } });
  }

  revalidatePath(`/admin/categories/${categoryId}`);
}

async function updateItem(fd: FormData) {
  "use server";
  await requireAnyRole(["ADMIN"]);
  const id = fd.get("id") as string;
  const categoryId = fd.get("categoryId") as string;
  const name = (fd.get("name") as string).trim();
  const defaultUnit = ((fd.get("defaultUnit") as string) ?? "").trim() || null;
  if (!name) return;

  const category = await prisma.expenseCategory.findUnique({ where: { id: categoryId } });
  if (!category) return;

  const optInt = (v: unknown) => { const n = parseInt(String(v ?? ""), 10); return Number.isNaN(n) || n < 0 ? null : n; };
  const stockUnit = category.isStock ? parseUnit(fd.get("stockUnit")) : null;
  const minStock  = category.isStock ? optInt(fd.get("minStock"))  : null;
  const optStock  = category.isStock ? optInt(fd.get("optimalStock")) : null;

  await prisma.expenseCategoryItem.update({
    where: { id },
    data: { name, defaultUnit, stockUnit, minStock, optimalStock: optStock },
  });

  if (category.isStock) {
    const stockItemId = await upsertStockItem({
      categoryName: category.name,
      itemId: id,
      name,
      unit: stockUnit!,
      minStock,
      optimalStock: optStock,
    });
    await prisma.expenseCategoryItem.update({ where: { id }, data: { stockItemId } });
  }

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
  if (item.stockItemId) {
    await prisma.stockItem.update({ where: { id: item.stockItemId }, data: { isActive: !item.isActive } });
  }
  revalidatePath(`/admin/categories/${categoryId}`);
}

async function deleteItem(fd: FormData) {
  "use server";
  await requireAnyRole(["ADMIN"]);
  const id = fd.get("id") as string;
  const categoryId = fd.get("categoryId") as string;
  const item = await prisma.expenseCategoryItem.findUnique({ where: { id } });
  await prisma.expenseCategoryItem.delete({ where: { id } });
  if (item?.stockItemId) {
    await prisma.stockItem.update({ where: { id: item.stockItemId }, data: { isActive: false } });
  }
  revalidatePath(`/admin/categories/${categoryId}`);
}

// ── Page ───────────────────────────────────────────────────────────────────

export default async function CategoryItemsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  await requireAnyRole(["ADMIN"]);
  const { id } = await params;
  const { edit } = await searchParams;

  const category = await prisma.expenseCategory.findUnique({
    where: { id },
    include: { items: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
  });
  if (!category) notFound();

  const editing = edit ? category.items.find((i) => i.id === edit) : null;

  // Load current stock levels for stock categories
  let stockLevelMap = new Map<string, number>();
  if (category.isStock) {
    const linkedItemIds = category.items.map((i) => i.stockItemId).filter(Boolean) as string[];
    if (linkedItemIds.length > 0) {
      const movements = await prisma.stockMovement.groupBy({
        by: ["stockItemId"],
        where: { stockItemId: { in: linkedItemIds } },
        _sum: { qty: true },
      });
      stockLevelMap = new Map(movements.map((m) => [m.stockItemId, m._sum.qty ?? 0]));
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <a href="/admin/categories" className="text-sm text-brand hover:underline">
          ← Expense Categories
        </a>
        <h2 className="text-base font-semibold text-gray-800">
          {category.name} — Items
        </h2>
        {category.isStock && (
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
            Stock
          </span>
        )}
      </div>

      {!category.isStock && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          This category is not marked as Stock. Items here appear as description dropdowns in the expense form.
          Min/Optimal stock fields are only active for Stock categories.
        </div>
      )}

      {/* Edit panel */}
      {editing && (
        <section className="rounded-xl bg-white p-4 shadow-sm border border-blue-100">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">Edit: {editing.name}</h3>
          <form action={updateItem} className="space-y-2 text-sm">
            <input type="hidden" name="id" value={editing.id} />
            <input type="hidden" name="categoryId" value={id} />
            <input name="name" required defaultValue={editing.name}
              placeholder="Item name"
              className="w-full rounded-lg border border-gray-300 px-3 py-2" />
            <input name="defaultUnit" defaultValue={editing.defaultUnit ?? ""}
              placeholder="Default unit in expense form (e.g. kg, box)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2" />
            {category.isStock && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Inventory Unit</label>
                  <select name="stockUnit" defaultValue={editing.stockUnit ?? "UNIT"}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2">
                    {UNITS.map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">Min Stock</label>
                    <input name="minStock" type="number" min="0" defaultValue={editing.minStock ?? ""}
                      placeholder="—"
                      className="w-full rounded-lg border border-gray-300 px-3 py-1.5" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">Optimal Stock</label>
                    <input name="optimalStock" type="number" min="0" defaultValue={editing.optimalStock ?? ""}
                      placeholder="—"
                      className="w-full rounded-lg border border-gray-300 px-3 py-1.5" />
                  </div>
                </div>
              </>
            )}
            <div className="flex gap-2">
              <SubmitButton className="flex-1 rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
                Save
              </SubmitButton>
              <a href={`/admin/categories/${id}`}
                className="flex-1 rounded-lg border border-gray-300 py-2 text-center text-sm text-gray-600 hover:bg-gray-50">
                Cancel
              </a>
            </div>
          </form>
        </section>
      )}

      {/* Existing items */}
      <section className="rounded-xl bg-white shadow-sm">
        <h3 className="border-b border-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">
          Items ({category.items.length})
        </h3>
        {category.items.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-400">No items yet. Add one below.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500">
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-left font-medium">Unit</th>
                {category.isStock && (
                  <>
                    <th className="px-4 py-2 text-center font-medium">Stock</th>
                    <th className="px-4 py-2 text-center font-medium">Min / Optimal</th>
                  </>
                )}
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {category.items.map((item) => {
                const currentStock = item.stockItemId ? (stockLevelMap.get(item.stockItemId) ?? 0) : null;
                const isLow = item.minStock != null && currentStock != null && currentStock <= item.minStock;
                const isOk  = item.optimalStock != null && currentStock != null && currentStock >= item.optimalStock;
                const stockColor = isLow ? "text-red-600 font-bold" : isOk ? "text-green-600" : "text-yellow-600";
                return (
                  <tr key={item.id}>
                    <td className="px-4 py-2">
                      <span className={item.isActive ? "font-medium" : "font-medium text-gray-400 line-through"}>
                        {item.name}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500">
                      {item.stockUnit ? UNIT_ABBR[item.stockUnit] : (item.defaultUnit ?? "—")}
                    </td>
                    {category.isStock && (
                      <>
                        <td className={`px-4 py-2 text-center text-xs ${currentStock != null ? stockColor : "text-gray-300"}`}>
                          {currentStock ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-center text-xs text-gray-500">
                          {item.minStock ?? "—"} / {item.optimalStock ?? "—"}
                        </td>
                      </>
                    )}
                    <td className="px-4 py-2 text-right space-x-3">
                      <a href={`/admin/categories/${id}?edit=${item.id}`}
                        className="text-xs text-blue-600 hover:underline">Edit</a>
                      <form action={toggleItem} className="inline">
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="categoryId" value={id} />
                        <button className="text-xs text-gray-500 hover:underline">
                          {item.isActive ? "Hide" : "Show"}
                        </button>
                      </form>
                      <form action={deleteItem} className="inline">
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="categoryId" value={id} />
                        <button className="text-xs text-red-500 hover:underline">Delete</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Add new item */}
      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">Add Item</h3>
        <form action={addItem} className="space-y-2 text-sm">
          <input type="hidden" name="categoryId" value={id} />
          <input name="name" required placeholder="Item name (e.g. Pork Belly)"
            className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          <input name="defaultUnit"
            placeholder="Default unit in expense form (e.g. kg, box)"
            className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          {category.isStock && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Inventory Unit</label>
                <select name="stockUnit" defaultValue="UNIT"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2">
                  {UNITS.map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Min Stock (alert)</label>
                  <input name="minStock" type="number" min="0" placeholder="—"
                    className="w-full rounded-lg border border-gray-300 px-3 py-1.5" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Optimal Stock</label>
                  <input name="optimalStock" type="number" min="0" placeholder="—"
                    className="w-full rounded-lg border border-gray-300 px-3 py-1.5" />
                </div>
              </div>
            </>
          )}
          <SubmitButton className="w-full rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
            Add Item
          </SubmitButton>
        </form>
      </section>
    </div>
  );
}
