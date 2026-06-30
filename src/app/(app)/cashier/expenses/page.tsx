import Link from "next/link";
import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { formatMoney, formatTime } from "@/lib/format";
import { getT } from "@/lib/lang";
import ExpenseForm from "./ExpenseForm";

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

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/cashier" className="text-sm text-brand hover:underline">← {t("nav_cashier")}</Link>
        <h1 className="text-xl font-bold">{t("heading_expenses")}</h1>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">{t("section_record_expense")}</h3>
          <ExpenseForm
            allCategories={allCategories}
            stockCategories={stockCategories}
            currency={settings.currency}
          />
        </section>

        <section className="lg:col-span-2">
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

          <div className="rounded-xl bg-white shadow-sm">
            <h3 className="border-b border-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">
              {t("section_today_expenses")} ({expenses.length})
            </h3>
            <ul className="divide-y divide-gray-100">
              {expenses.length === 0 && (
                <li className="px-4 py-3 text-sm text-gray-400">{t("empty_no_expenses")}</li>
              )}
              {expenses.map((e) => (
                <li key={e.id} className="px-4 py-2.5 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium">{e.description}</span>
                        <span className="text-xs text-gray-400">{e.category.name}</span>
                        {e.invoiceType && (
                          <span className={
                            "rounded-full px-1.5 py-0.5 text-[10px] font-semibold " +
                            (e.invoiceType === "STOCK" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600")
                          }>
                            {e.invoiceType === "STOCK" ? "Stock" : "Non-stock"}
                          </span>
                        )}
                        {e.confirmedAt ? (
                          <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
                            {t("badge_expense_confirmed")}
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                            {t("badge_expense_awaiting")}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400">
                        {e.paymentSource === "CASH_DRAWER" ? t("source_cash_drawer") : t("source_bank_transfer")}
                        {e.vendor ? ` · ${e.vendor}` : ""} · {formatTime(e.createdAt)}
                      </div>

                      {/* Line items breakdown */}
                      {e.lines.length > 0 && (
                        <div className="mt-1.5 space-y-0.5">
                          {e.lines.map((line) => (
                            <div key={line.id} className="flex items-center justify-between text-[11px] text-gray-500">
                              <span>
                                {line.description}
                                {line.unit ? <span className="text-gray-400"> · {line.qty} {line.unit}</span> : ""}
                              </span>
                              <span className="tabular-nums">{line.price.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {e.attachments.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {e.attachments.map((a) => (
                            <a key={a.id} href={`/api/uploads/${a.filePath}`} target="_blank" rel="noopener noreferrer">
                              <img src={`/api/uploads/${a.filePath}`} alt="receipt"
                                className="h-12 w-12 rounded border object-cover hover:opacity-80" />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="flex-shrink-0 font-semibold tabular-nums">
                      {formatMoney(e.amount, settings.currency)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
