import Link from "next/link";
import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/format";
import { mmToday, mmDayRange } from "@/lib/business-day";
import { getT } from "@/lib/lang";
import ExpenseForm from "./ExpenseForm";
import ExpenseList from "./ExpenseList";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  await requireAnyRole(["CASHIER", "MANAGER", "ADMIN"]);
  const settings = await getSettings();
  const t = await getT();

  const startOfDay = mmDayRange(mmToday()).start;

  const [allCategories, stockCategories, expenses, suppliers, outstandingDeliveries] = await Promise.all([
    prisma.expenseCategory.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.expenseCategory.findMany({
      where: { isActive: true, isStock: true },
      orderBy: { name: "asc" },
      include: {
        items: {
          // Only items linked to a tracked StockItem can create delivery lines
          where: { isActive: true, stockItemId: { not: null } },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: { id: true, name: true, defaultUnit: true, stockItemId: true },
        },
      },
    }),
    prisma.expense.findMany({
      where: { businessDate: { gte: startOfDay } },
      include: {
        category: true,
        attachments: true,
        lines: { orderBy: { sortOrder: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.supplier.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    // Outstanding deliveries an incoming invoice can be tagged to
    prisma.stockDelivery.findMany({
      where: {
        OR: [
          { status: "PREPAID", cashierSubmittedAt: null },
          { status: "PARTIAL" },
        ],
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        invoiceNo: true,
        totalCost: true,
        prepaidAt: true,
        supplier: { select: { id: true, name: true } },
      },
    }),
  ]);

  const active = expenses.filter((e) => !e.rejectedAt);
  const cashTotal = active.filter((e) => e.paymentSource === "CASH_DRAWER").reduce((s, e) => s + e.amount, 0);
  const bankTotal = active.filter((e) => e.paymentSource === "BANK_TRANSFER").reduce((s, e) => s + e.amount, 0);

  const serializedExpenses = expenses.map((e) => ({
    id: e.id,
    description: e.description,
    amount: e.amount,
    paymentSource: e.paymentSource,
    invoiceType: e.invoiceType,
    confirmedAt: e.confirmedAt?.toISOString() ?? null,
    rejectedAt: e.rejectedAt?.toISOString() ?? null,
    rejectionReason: e.rejectionReason,
    createdAt: e.createdAt.toISOString(),
    vendor: e.vendor,
    category: { name: e.category.name },
    lines: e.lines.map((l) => ({ id: l.id, description: l.description, unit: l.unit, qty: l.qty, price: l.price })),
    attachments: e.attachments.map((a) => ({ id: a.id, filePath: a.filePath })),
  }));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/cashier" className="text-sm text-brand hover:underline">← {t("nav_cashier")}</Link>
        <h1 className="text-xl font-bold">{t("heading_expenses")}</h1>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">{t("section_record_expense")}</h3>
          <ExpenseForm
            allCategories={allCategories}
            stockCategories={stockCategories}
            suppliers={suppliers}
            outstandingDeliveries={outstandingDeliveries.map((d) => ({
              id: d.id,
              status: d.status,
              paymentStatus: d.paymentStatus,
              label: `${d.supplier?.name ?? t("label_no_supplier")}`
                + (d.invoiceNo ? ` · #${d.invoiceNo}` : "")
                + (d.totalCost != null ? ` · ${d.totalCost.toLocaleString()} ${settings.currency}` : ""),
              supplierId: d.supplier?.id ?? "",
            }))}
            currency={settings.currency}
            labels={{
              supplier: t("label_supplier"),
              noSupplier: t("label_no_supplier"),
              invoiceNo: t("label_invoice_no"),
              tagDelivery: t("label_tag_outstanding_delivery"),
              tagNone: t("label_tag_none"),
              taggedNoPayment: t("hint_tagged_no_payment"),
              unitCost: t("label_unit_cost_short"),
              submitStockInvoice: t("btn_submit_stock_invoice"),
              stockInvoiceHint: t("hint_stock_invoice_creates_delivery"),
              prepaymentHeading: t("heading_record_stock_prepayment"),
              prepaymentToggle: t("btn_record_prepayment_short"),
              prepaymentHint: t("hint_prepayment_notice"),
              amount: t("label_amount"),
              record: t("btn_record_prepayment"),
              cancel: t("btn_cancel"),
            }}
          />
        </section>

        <section>
          <div className="mb-3 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <div className="text-xs uppercase text-gray-400">{t("label_cash_drawer_today")}</div>
              <div className="text-xl font-bold text-red-600">{formatMoney(cashTotal, settings.currency)}</div>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <div className="text-xs uppercase text-gray-400">{t("label_bank_transfer_today")}</div>
              <div className="text-xl font-bold text-gray-700">{formatMoney(bankTotal, settings.currency)}</div>
            </div>
          </div>

          <ExpenseList expenses={serializedExpenses} currency={settings.currency} />
        </section>
      </div>
    </div>
  );
}
