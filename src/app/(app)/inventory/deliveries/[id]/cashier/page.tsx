import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAnyRole } from "@/lib/auth";
import { recordPrepayment } from "../actions";
import SubmitButton from "@/components/SubmitButton";
import StockInvoiceForm from "./StockInvoiceForm";
import NonStockInvoiceForm from "./NonStockInvoiceForm";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

export default async function CashierEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  await requireAnyRole(["CASHIER", "MANAGER", "ADMIN"]);
  const { id } = await params;
  const { mode } = await searchParams;
  const isPrepay = mode === "prepay";
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

  if (delivery.cashierSubmittedAt && !isPrepay) {
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
          {isPrepay ? t("heading_record_prepayment") : t("heading_enter_invoice")} — {title}
        </h2>
        <a href={`/inventory/deliveries/${id}`} className="text-sm text-blue-600 hover:underline">
          {t("btn_cancel")}
        </a>
      </div>

      {isPrepay ? (
        <section className="rounded-xl bg-white p-5 shadow-sm">
          <div className="mb-4 rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-800">
            {t("hint_prepayment_notice")}
          </div>
          <form action={recordPrepayment} className="space-y-4 text-sm">
            <input type="hidden" name="id" value={id} />
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">{t("label_total_paid")}</label>
              <input name="totalCost" type="number" min="1" required placeholder="0"
                className="w-full rounded-lg border border-gray-300 px-3 py-2" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">{t("label_expense_category")}</label>
              <select name="categoryId" required className="w-full rounded-lg border border-gray-300 px-3 py-2">
                <option value="">— {t("label_select_placeholder")} —</option>
                {expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">{t("label_payment_method")}</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="paymentSource" value="CASH_DRAWER" defaultChecked /> {t("label_cash_drawer")}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="paymentSource" value="BANK_TRANSFER" /> {t("label_bank_transfer")}
                </label>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">{t("label_description")}</label>
              <input name="description" placeholder="e.g. Advance payment for beer order" maxLength={300}
                className="w-full rounded-lg border border-gray-300 px-3 py-2" />
            </div>
            <SubmitButton className="w-full rounded-lg bg-yellow-500 py-2 font-semibold text-white hover:bg-yellow-600 disabled:opacity-60">
              {t("btn_record_prepayment")}
            </SubmitButton>
          </form>
        </section>
      ) : delivery.invoiceType === "NON_STOCK" ? (
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
