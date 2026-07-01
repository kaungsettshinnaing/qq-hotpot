import Link from "next/link";
import { prisma } from "@/lib/db";
import StockInForm from "./StockInForm";

export const dynamic = "force-dynamic";

export default async function NewDeliveryPage() {
  // Load stock-type expense categories with their configured items (which carry a linked stockItemId)
  const stockCategories = await prisma.expenseCategory.findMany({
    where: { isActive: true, isStock: true },
    orderBy: { name: "asc" },
    include: {
      items: {
        where: { isActive: true, stockItemId: { not: null } },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, defaultUnit: true, stockUnit: true, stockItemId: true, imageUrl: true },
      },
    },
  });

  const items = stockCategories.flatMap((cat) =>
    cat.items.map((i) => ({
      id: i.stockItemId!,
      name: i.name,
      unit: i.stockUnit ?? "UNIT",
      unitLabel: i.defaultUnit ?? null,
      categoryId: cat.id,
      categoryName: cat.name,
      imageUrl: i.imageUrl ?? null,
    }))
  );

  const categories = stockCategories.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/inventory/deliveries" className="text-sm text-brand hover:underline">
          ← Deliveries
        </Link>
        <h2 className="text-base font-semibold text-gray-800">Record Stock-In</h2>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-5 text-sm text-amber-800">
          No stock items configured yet. Go to{" "}
          <Link href="/admin/categories" className="font-medium underline">
            Admin → Categories
          </Link>{" "}
          and add items to a Stock category first.
        </div>
      ) : (
        <section className="rounded-xl bg-white p-5 shadow-sm">
          <StockInForm categories={categories} items={items} />
        </section>
      )}
    </div>
  );
}
