import Link from "next/link";
import { prisma } from "@/lib/db";
import StockInForm from "./StockInForm";

export const dynamic = "force-dynamic";

export default async function NewDeliveryPage() {
  const [categories, items] = await Promise.all([
    prisma.stockCategory.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.stockItem.findMany({
      where: { isActive: true },
      orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
      select: { id: true, name: true, unit: true, categoryId: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/inventory/deliveries" className="text-sm text-brand hover:underline">
          ← Deliveries
        </Link>
        <h2 className="text-base font-semibold text-gray-800">Record Stock-In</h2>
      </div>

      <section className="rounded-xl bg-white p-5 shadow-sm">
        <StockInForm
          categories={categories}
          items={items.map((i) => ({
            id: i.id,
            name: i.name,
            unit: i.unit,
            categoryId: i.categoryId,
          }))}
        />
      </section>
    </div>
  );
}
