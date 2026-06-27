import Link from "next/link";
import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { formatMoney, formatTime } from "@/lib/format";
import SubmitButton from "@/components/SubmitButton";
import { addExpense } from "../actions";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

function pad(n: number) { return String(n).padStart(2, "0"); }

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAnyRole(["CASHIER", "MANAGER", "ADMIN"]);
  const { error } = await searchParams;
  const settings = await getSettings();
  const t = await getT();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const today = `${startOfDay.getFullYear()}-${pad(startOfDay.getMonth() + 1)}-${pad(startOfDay.getDate())}`;

  const [categories, expenses] = await Promise.all([
    prisma.expenseCategory.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.expense.findMany({
      where: { businessDate: { gte: startOfDay } },
      include: { category: true, attachments: true },
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
          {error && (
            <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{t("error_fill_expense_fields")}</p>
          )}
          <form action={addExpense} className="space-y-2 text-sm">
            <select name="categoryId" required className="w-full rounded-lg border border-gray-300 px-3 py-2">
              <option value="">{t("select_category_placeholder")}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <input name="amount" type="number" min={1} required
              placeholder={`${t("label_payment_amount")} (${settings.currency})`}
              className="w-full rounded-lg border border-gray-300 px-3 py-2" />
            <div>
              <span className="mb-1 block text-xs text-gray-500">{t("label_paid_from")}</span>
              <div className="flex gap-3">
                <label className="flex items-center gap-1">
                  <input type="radio" name="paymentSource" value="CASH_DRAWER" defaultChecked /> {t("radio_cash_drawer")}
                </label>
                <label className="flex items-center gap-1">
                  <input type="radio" name="paymentSource" value="BANK_TRANSFER" /> {t("radio_bank_transfer")}
                </label>
              </div>
              <p className="mt-1 text-[11px] text-gray-400">{t("expense_source_note")}</p>
            </div>
            <input name="description" required placeholder={t("placeholder_description")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2" />
            <div className="grid grid-cols-2 gap-2">
              <input name="vendor" placeholder={t("placeholder_vendor_optional")}
                className="rounded-lg border border-gray-300 px-3 py-2" />
              <input name="businessDate" type="date" defaultValue={today}
                className="rounded-lg border border-gray-300 px-3 py-2" />
            </div>
            <div>
              <span className="mb-1 block text-xs text-gray-500">{t("label_receipts_optional")}</span>
              <input name="receipts" type="file" multiple accept="image/*,application/pdf"
                className="w-full rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 file:mr-3 file:rounded file:border-0 file:bg-brand/10 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-brand" />
            </div>
            <SubmitButton
              className="w-full rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
              pendingText={t("pending_saving")}
            >
              {t("btn_add_expense")}
            </SubmitButton>
          </form>
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
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium">{e.description}</span>
                        <span className="text-xs text-gray-400">{e.category.name}</span>
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
