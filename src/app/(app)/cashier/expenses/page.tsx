import Link from "next/link";
import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { formatMoney, formatTime } from "@/lib/format";
import SubmitButton from "@/components/SubmitButton";
import { addExpense } from "../actions";

export const dynamic = "force-dynamic";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAnyRole(["CASHIER", "MANAGER", "ADMIN"]);
  const { error } = await searchParams;
  const settings = await getSettings();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const today = `${startOfDay.getFullYear()}-${pad(startOfDay.getMonth() + 1)}-${pad(startOfDay.getDate())}`;

  const [categories, expenses] = await Promise.all([
    prisma.expenseCategory.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.expense.findMany({
      where: { businessDate: { gte: startOfDay } },
      include: { category: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const cashTotal = expenses
    .filter((e) => e.paymentSource === "CASH_DRAWER")
    .reduce((s, e) => s + e.amount, 0);
  const bankTotal = expenses
    .filter((e) => e.paymentSource === "BANK_TRANSFER")
    .reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/cashier" className="text-sm text-brand hover:underline">
          ← Cashier
        </Link>
        <h1 className="text-xl font-bold">Expenses</h1>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">Record an expense</h3>
          {error && (
            <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              Please fill category, amount and description.
            </p>
          )}
          <form action={addExpense} className="space-y-2 text-sm">
            <select
              name="categoryId"
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="">Category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              name="amount"
              type="number"
              min={1}
              required
              placeholder={`Amount (${settings.currency})`}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
            <div>
              <span className="mb-1 block text-xs text-gray-500">Paid from</span>
              <div className="flex gap-3">
                <label className="flex items-center gap-1">
                  <input type="radio" name="paymentSource" value="CASH_DRAWER" defaultChecked /> Cash
                  drawer
                </label>
                <label className="flex items-center gap-1">
                  <input type="radio" name="paymentSource" value="BANK_TRANSFER" /> Bank transfer
                </label>
              </div>
              <p className="mt-1 text-[11px] text-gray-400">
                Cash-drawer expenses reduce expected cash at shift close. Bank transfers do not.
              </p>
            </div>
            <input
              name="description"
              required
              placeholder="Description"
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                name="vendor"
                placeholder="Vendor (optional)"
                className="rounded-lg border border-gray-300 px-3 py-2"
              />
              <input
                name="businessDate"
                type="date"
                defaultValue={today}
                className="rounded-lg border border-gray-300 px-3 py-2"
              />
            </div>
            <SubmitButton
              className="w-full rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
              pendingText="Saving…"
            >
              Add expense
            </SubmitButton>
          </form>
        </section>

        <section className="lg:col-span-2">
          <div className="mb-3 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <div className="text-xs uppercase text-gray-400">Cash drawer (today)</div>
              <div className="text-xl font-bold text-red-600">
                {formatMoney(cashTotal, settings.currency)}
              </div>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <div className="text-xs uppercase text-gray-400">Bank transfer (today)</div>
              <div className="text-xl font-bold text-gray-700">
                {formatMoney(bankTotal, settings.currency)}
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-white shadow-sm">
            <h3 className="border-b border-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">
              Today&apos;s expenses ({expenses.length})
            </h3>
            <ul className="divide-y divide-gray-100">
              {expenses.length === 0 && (
                <li className="px-4 py-3 text-sm text-gray-400">No expenses yet.</li>
              )}
              {expenses.map((e) => (
                <li key={e.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <div>
                    <div className="font-medium">
                      {e.description}
                      <span className="ml-2 text-xs text-gray-400">{e.category.name}</span>
                    </div>
                    <div className="text-xs text-gray-400">
                      {e.paymentSource === "CASH_DRAWER" ? "Cash drawer" : "Bank transfer"}
                      {e.vendor ? ` · ${e.vendor}` : ""} · {formatTime(e.createdAt)}
                    </div>
                  </div>
                  <span className="font-semibold tabular-nums">
                    {formatMoney(e.amount, settings.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
