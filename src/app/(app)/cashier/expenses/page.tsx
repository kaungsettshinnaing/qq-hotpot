import Link from "next/link";
import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/format";
import { getT } from "@/lib/lang";
import ExpenseForm from "./ExpenseForm";
import ExpenseList from "./ExpenseList";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  await requireAnyRole(["CASHIER", "MANAGER", "ADMIN"]);
  const settings = await getSettings();
  const t = await getT();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [allCategories, stockCategories, expenses] = await Promise.all([
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
          where: { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: { id: true, name: true, defaultUnit: true },
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
  ]);

  const cashTotal = expenses.filter((e) => e.paymentSource === "CASH_DRAWER").reduce((s, e) => s + e.amount, 0);
  const bankTotal = expenses.filter((e) => e.paymentSource === "BANK_TRANSFER").reduce((s, e) => s + e.amount, 0);

  const serializedExpenses = expenses.map((e) => ({
    id: e.id,
    description: e.description,
    amount: e.amount,
    paymentSource: e.paymentSource,
    invoiceType: e.invoiceType,
    confirmedAt: e.confirmedAt?.toISOString() ?? null,
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
            currency={settings.currency}
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
