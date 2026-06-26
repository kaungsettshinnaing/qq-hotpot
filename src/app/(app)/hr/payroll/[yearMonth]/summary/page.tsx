import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { formatDate } from "@/lib/format";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export default async function PayrollSummaryPage({
  params,
}: {
  params: Promise<{ yearMonth: string }>;
}) {
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
    },
  });
  if (!payroll) notFound();

  const total = payroll.items.reduce((s, i) => s + i.netPay, 0);

  return (
    <div className="mx-auto max-w-2xl print:shadow-none">
      <div className="mb-4 flex justify-end gap-2 print:hidden">
        <button onClick={() => window.print()} className="btn-brand">Print</button>
      </div>

      <div className="rounded-xl border bg-white p-8 shadow-sm print:border-0">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold">QQ Hotpot BBQ</h1>
          <p className="text-sm font-medium">Payroll Summary — {MONTHS[month - 1]} {year}</p>
          <p className="text-xs text-gray-400">{payroll.status === "LOCKED" ? "Locked ✓" : "Draft"}</p>
        </div>

        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="py-2">No.</th>
              <th className="py-2">Name</th>
              <th className="py-2 text-right">Basic</th>
              <th className="py-2 text-right">Deduct</th>
              <th className="py-2 text-right">Bonus</th>
              <th className="py-2 text-right font-bold">Net Pay (MMK)</th>
              <th className="py-2 text-center">Signature</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {payroll.items.map((item, idx) => {
              const netAbsent = Math.max(0, item.absentDays - item.otDays);
              const totalDeductions = item.absenceDeduction + item.advanceDeduction + item.fineDeduction;
              const totalBonus = item.otPremium + (netAbsent === 0 ? item.attendanceBonusAmt : 0) + item.adHocBonuses;
              return (
                <tr key={item.id}>
                  <td className="py-2">{idx + 1}</td>
                  <td className="py-2 font-medium">{item.employee.user.name}</td>
                  <td className="py-2 text-right">{item.basicSalary.toLocaleString()}</td>
                  <td className="py-2 text-right text-red-500">{totalDeductions > 0 ? totalDeductions.toLocaleString() : "—"}</td>
                  <td className="py-2 text-right text-green-600">{totalBonus > 0 ? totalBonus.toLocaleString() : "—"}</td>
                  <td className="py-2 text-right font-bold">{item.netPay.toLocaleString()}</td>
                  <td className="py-2 border-b border-dashed w-24">&nbsp;</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t">
            <tr>
              <td colSpan={5} className="py-3 text-right font-bold">Total</td>
              <td className="py-3 text-right font-bold text-brand">{total.toLocaleString()}</td>
              <td />
            </tr>
          </tfoot>
        </table>

        <div className="mt-8 text-xs text-gray-400">
          Generated on {formatDate(new Date())}
        </div>
      </div>
    </div>
  );
}
