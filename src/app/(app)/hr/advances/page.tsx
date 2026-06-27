import { prisma } from "@/lib/db";
import { createAdvance, deleteInstalment } from "./actions";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default async function AdvancesPage() {
  const t = await getT();
  const now = new Date();

  const [employees, instalments] = await Promise.all([
    prisma.employee.findMany({
      where: { isActive: true },
      include: { user: { select: { name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.advanceInstalment.findMany({
      include: {
        advance: {
          include: { employee: { include: { user: { select: { name: true } } } } },
        },
      },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">{t("heading_salary_advances")}</h1>

      <form action={createAdvance} className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-semibold text-sm">{t("subheading_add_advance")}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="label">{t("label_employee")}</label>
            <select name="employeeId" required className="input">
              <option value="">{t("label_select_placeholder")}…</option>
              {employees.map((e) => (
                <option key={e.userId} value={e.userId}>{e.user.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{t("label_amount_mmk")}</label>
            <input name="amount" type="number" min="1" required className="input" />
          </div>
          <div>
            <label className="label">{t("label_note")}</label>
            <input name="note" className="input" />
          </div>
          <div>
            <label className="label">{t("label_deduct_month")}</label>
            <select name="month" className="input">
              {MONTHS.map((m, i) => (
                <option key={i} value={i + 1} selected={i === now.getMonth()}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{t("label_year")}</label>
            <input name="year" type="number" className="input" defaultValue={now.getFullYear()} />
          </div>
        </div>
        <button type="submit" className="btn-brand mt-3">{t("btn_add_advance")}</button>
      </form>

      <div className="rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left">{t("col_employee")}</th>
              <th className="px-4 py-2 text-left">{t("col_amount")}</th>
              <th className="px-4 py-2 text-left">{t("col_note")}</th>
              <th className="px-4 py-2 text-left">{t("col_deduct")}</th>
              <th className="px-4 py-2 text-left">{t("col_status")}</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {instalments.map((inst) => (
              <tr key={inst.id}>
                <td className="px-4 py-2 font-medium">{inst.advance.employee.user.name}</td>
                <td className="px-4 py-2">{inst.amount.toLocaleString()} MMK</td>
                <td className="px-4 py-2 text-gray-500">{inst.advance.note ?? "—"}</td>
                <td className="px-4 py-2 text-gray-500">
                  {MONTHS[inst.month - 1]} {inst.year}
                </td>
                <td className="px-4 py-2">
                  <span className={`badge ${inst.deducted ? "badge-green" : "badge-gray"}`}>
                    {inst.deducted ? t("badge_deducted") : t("badge_pending")}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {!inst.deducted && (
                    <form action={deleteInstalment}>
                      <input type="hidden" name="id" value={inst.id} />
                      <button type="submit" className="text-xs text-red-500 hover:underline">
                        {t("btn_delete")}
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {instalments.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">{t("empty_no_advances")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
