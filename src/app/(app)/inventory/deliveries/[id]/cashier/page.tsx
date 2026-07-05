import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAnyRole } from "@/lib/auth";
import StockInvoiceForm from "./StockInvoiceForm";
import NonStockInvoiceForm from "./NonStockInvoiceForm";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

// Legacy entry page — kept for in-flight deliveries created before the
// invoice-as-delivery flow. New stock invoices are entered at Cashier →
// Expenses (see addStockInvoice).
export default async function CashierEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAnyRole(["CASHIER", "MANAGER", "ADMIN"]);
  const { id } = await params;
  const t = await getT();

  const delivery = await prisma.stockDelivery.findUniqueOrThrow({
    where: { id },
    include: {
      supplier: true,
      items: {
        select: {
          stockItemId: true,
          orderedQty: true,
          cashierQty: true,
          unitCost: true,
        },
      },
    },
  });

  if (delivery.cashierSubmittedAt) {
    redirect(`/inventory/deliveries/${id}`);
  }

  const expenseCategories = await prisma.expenseCategory.findMany({
    where: { isActive: true, isStock: true },
    orderBy: { name: "asc" },
  });

  const title = delivery.invoiceNo ? `#${delivery.invoiceNo}` : `Delivery ${id.slice(-6)}`;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800">
          {t("heading_enter_invoice")} — {title}
        </h2>
        <a href={`/inventory/deliveries/${id}`} className="text-sm text-blue-600 hover:underline">
          {t("btn_cancel")}
        </a>
      </div>

      {delivery.invoiceType === "NON_STOCK" ? (
        <section className="rounded-xl bg-white p-5 shadow-sm">
          <div className="mb-4">
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
              {t("option_non_stock_invoice")}
            </span>
          </div>
          <NonStockInvoiceForm
            deliveryId={id}
            expenseCategories={expenseCategories}
          />
        </section>
      ) : (
        <section className="rounded-xl bg-white p-5 shadow-sm">
          <div className="mb-4">
            <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
              {t("option_stock_invoice")}
            </span>
          </div>
          <StockInvoiceFormLoader
            deliveryId={id}
            expenseCategories={expenseCategories}
            existingItems={delivery.items}
          />
        </section>
      )}
    </div>
  );
}

async function StockInvoiceFormLoader({
  deliveryId,
  expenseCategories,
  existingItems,
}: {
  deliveryId: string;
  expenseCategories: { id: string; name: string }[];
  existingItems: { stockItemId: string | null; orderedQty: number | null; cashierQty: number | null; unitCost: number | null }[];
}) {
  const [stockItems, categories] = await Promise.all([
    prisma.stockItem.findMany({
      where: { isActive: true },
      orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        unit: true,
        categoryId: true,
        category: { select: { name: true } },
      },
    }),
    prisma.stockCategory.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <StockInvoiceForm
      deliveryId={deliveryId}
      stockItems={stockItems.map((i) => ({
        id: i.id,
        name: i.name,
        unit: i.unit,
        categoryId: i.categoryId,
        categoryName: i.category?.name ?? null,
      }))}
      categories={categories}
      expenseCategories={expenseCategories}
      existingItems={existingItems}
    />
  );
}
