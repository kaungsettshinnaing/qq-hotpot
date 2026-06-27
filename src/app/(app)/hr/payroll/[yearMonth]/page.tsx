import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { generatePayroll, lockPayroll } from "./actions";
import { getT } from "@/lib/lang";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default async function PayrollDetailPage({
  params,
}: {
  params: Promise<{ yearMonth: string }>;
}) {
  const t = await getT();
  const { yearMonth } = await params;
  const [yearStr, monthStr] = yearMonth.split("-");
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);

  const payroll = await prisma.payroll.findUnique({
    where: { month_year: { month, year } },
    include: {
      items: {
        include: { employee: { include: { user: { select: { name: true } } } } },
        orderBy: { employee: { user: { name: "asc" } } },
      },
      lockedBy: { select: { name: true } },
    },
  });

  const isLocked = payroll?.status === "LOCKED";
  const totalNet = payroll?.items.reduce((s, i) => s + i.netPay, 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">
          {t("heading_payroll")} — {MONTHS[month - 1]} {year}
        </h1>
        {isLocked ? (
          <span className="badge badge-green">{t("payroll_locked").toUpperCase()}</span>
        ) : (
          <span className="badge badge-gray">{t("status_draft").toUpperCase()}</span>
        )}
        <Link href="/hr/payroll" className="ml-auto text-sm text-brand hover:underline">{t("link_all_payrolls")}</Link>
      </div>

      {!isLocked && (
        <div className="flex gap-3">
          <form action={generatePayroll}>
            <input type="hidden" name="yearMonth" value={yearMonth} />
            <button type="submit" className="btn-brand">
              {payroll ? t("btn_regenerate") : t("btn_generate_payroll")}
            </button>
          </form>
          {payroll && payroll.items.length > 0 && (
            <form action={lockPayroll} onSubmit={(e) => {
              if (!confirm(t("confirm_lock_payroll"))) e.preventDefault();
            }}>
              <input type="hidden" name="yearMonth" value={yearMonth} />
              <button type="submit" className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
                {t("btn_lock_payroll")}
              </button>
            </form>
          )}
        </div>
      )}

      {isLocked && payroll?.lockedBy && (
        <p className="text-sm text-gray-400">
          {t("locked_by_note", { name: payroll.lockedBy.name, date: formatDate(payroll.lockedAt) })}
        </p>
      )}

      {payroll && payroll.items.length > 0 ? (
        <>
          <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left">{t("col_employee")}</th>
                  <th className="px-3 py-2 text-right">{t("col_basic")}</th>
                  <th className="px-3 py-2 text-right">{t("col_work_days")}</th>
                  <th className="px-3 py-2 text-right">{t("col_absent")}</th>
                  <th className="px-3 py-2 text-right">{t("col_ot")}</th>
                  <th className="px-3 py-2 text-right">{t("col_att_bonus")}</th>
                  <th className="px-3 py-2 text-right">{t("col_ot_premium")}</th>
                  <th className="px-3 py-2 text-right">{t("col_adhoc")}</th>
                  <th className="px-3 py-2 text-right">{t("col_advance")}</th>
                  <th className="px-3 py-2 text-right">{t("col_fines")}</th>
                  <th className="px-3 py-2 text-right font-bold">{t("col_net_pay")}</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {payroll.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-2 font-medium">{item.employee.user.name}</td>
                    <td className="px-3 py-2 text-right">{item.basicSalary.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{item.workingDays}</td>
                    <td className="px-3 py-2 text-right">
                      {item.absentDays > 0 ? <span className="text-red-500">{item.absentDays}</span> : "0"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {item.otDays > 0 ? <span className="text-purple-600">{item.otDays}</span> : "0"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {item.attendanceBonusAmt > 0 ? (
                        item.absenceDeduction === 0
                          ? <span className="text-green-600">{item.attendanceBonusAmt.toLocaleString()}</span>
                          : <span className="text-gray-300">{item.attendanceBonusAmt.toLocaleString()}</span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-purple-600">
                      {item.otPremium > 0 ? `+${item.otPremium.toLocaleString()}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-green-600">
                      {item.adHocBonuses > 0 ? `+${item.adHocBonuses.toLocaleString()}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-red-500">
                      {item.advanceDeduction > 0 ? `-${item.advanceDeduction.toLocaleString()}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-red-500">
                      {item.fineDeduction > 0 ? `-${item.fineDeduction.toLocaleString()}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-bold">{item.netPay.toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <Link href={`/hr/payroll/${yearMonth}/slip/${item.employeeId}`}
                        className="text-xs text-brand hover:underline">
                        {t("col_slip")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t bg-gray-50">
                <tr>
                  <td colSpan={10} className="px-4 py-2 text-right text-sm font-semibold">{t("row_total_payout")}</td>
                  <td className="px-3 py-2 text-right font-bold text-brand">{totalNet.toLocaleString()} MMK</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex justify-end">
            <Link href={`/hr/payroll/${yearMonth}/summary`}
              className="text-sm text-brand hover:underline">
              {t("link_print_summary")}
            </Link>
          </div>
        </>
      ) : (
        <div className="rounded-xl border bg-white p-10 text-center text-gray-400">
          <p className="mb-2">{t("empty_no_payroll_month")}</p>
          <p className="text-sm">{t("hint_generate_from_att")}</p>
        </div>
      )}
    </div>
  );
}
