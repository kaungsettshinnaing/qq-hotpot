import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAnyRole } from "@/lib/auth";
import StockInvoiceForm, { type StockInvoiceLabels } from "./StockInvoiceForm";
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
            labels={{
              expenseCategory: t("label_expense_category"),
              selectPlaceholder: `— ${t("label_select_placeholder")} —`,
              paymentMethod: t("label_payment_method_full"),
              cash: t("label_cash_short"),
              bank: t("label_bank_short"),
              description: t("placeholder_description"),
              descriptionPlaceholder: t("placeholder_office_supplies_example"),
              lineItemsHeading: t("heading_invoice_line_items"),
              addLine: t("btn_add_line"),
              descRequired: t("placeholder_description_required"),
              itemNamePlaceholder: t("label_item_name"),
              qtyRequired: t("placeholder_qty_required"),
              unit: t("label_unit"),
              kgBoxPlaceholder: t("placeholder_kg_box_example"),
              unitCostMmk: t("label_unit_cost_mmk"),
              totalTemplate: t("label_total_amount_mmk"),
              nonStockHint: t("hint_non_stock_cashier_only"),
              submitInvoice: t("btn_submit_invoice"),
            }}
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
            labels={{
              expenseCategory: t("label_expense_category"),
              selectPlaceholder: `— ${t("label_select_placeholder")} —`,
              paymentMethod: t("label_payment_method_full"),
              cash: t("label_cash_short"),
              bank: t("label_bank_short"),
              description: t("placeholder_description"),
              descriptionPlaceholder: t("placeholder_weekly_grocery_example"),
              filterByCategory: t("label_filter_category"),
              allItems: t("option_all_categories"),
              clear: t("btn_clear"),
              lineItemsHeading: t("section_line_items"),
              colItem: t("col_item"),
              colOrderedQty: t("col_ordered_qty"),
              colThisBatch: t("col_this_batch"),
              unitCostMmk: t("label_unit_cost_mmk"),
              leaveBlankHint: t("hint_leave_blank_not_in_delivery"),
              submitInvoice: t("btn_submit_invoice"),
            }}
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
  labels,
}: {
  deliveryId: string;
  expenseCategories: { id: string; name: string }[];
  existingItems: { stockItemId: string | null; orderedQty: number | null; cashierQty: number | null; unitCost: number | null }[];
  labels: StockInvoiceLabels;
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
      labels={labels}
    />
  );
}
