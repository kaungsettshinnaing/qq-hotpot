import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export default async function PayslipPage({
  params,
}: {
  params: Promise<{ yearMonth: string; employeeId: string }>;
}) {
  const { yearMonth, employeeId } = await params;
  const [yearStr, monthStr] = yearMonth.split("-");
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);

  const payroll = await prisma.payroll.findUnique({
    where: { month_year: { month, year } },
  });
  if (!payroll) notFound();

  const item = await prisma.payrollItem.findUnique({
    where: { payrollId_employeeId: { payrollId: payroll.id, employeeId: employeeId } },
    include: {
      employee: {
        include: { user: { select: { name: true } } },
      },
    },
  });
  if (!item) notFound();

  const adHocRows = await prisma.adHocBonus.findMany({
    where: { employeeId: employeeId, month, year },
  });

  const advanceInstalments = await prisma.advanceInstalment.findMany({
    where: { advance: { employeeId: employeeId }, month, year },
    include: { advance: { select: { note: true } } },
  });

  const fines = await prisma.employeeFine.findMany({
    where: { employeeId: employeeId, deductMonth: month, deductYear: year },
  });

  const netAbsent = Math.max(0, item.absentDays - item.otDays);
  const earnedBonus = netAbsent === 0 && item.attendanceBonusAmt > 0;

  return (
    <div className="mx-auto max-w-lg space-y-0 print:shadow-none">
      {/* Print button — hidden when printing */}
      <div className="mb-4 flex justify-end print:hidden">
        <button onClick={() => window.print()} className="btn-brand">Print</button>
      </div>

      <div className="rounded-xl border bg-white p-8 shadow-sm print:border-0 print:shadow-none">
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold tracking-wide">QQ Hotpot BBQ</h1>
          <p className="text-sm text-gray-500">PAYSLIP</p>
          <p className="text-sm font-medium">{MONTHS[month - 1]} {year}</p>
        </div>

        {/* Employee info */}
        <div className="mb-6 border-b pb-4">
          <div className="grid grid-cols-2 gap-1 text-sm">
            <span className="text-gray-500">Employee</span>
            <span className="font-medium">{item.employee.user.name}</span>
            {item.employee.employeeNo && (
              <>
                <span className="text-gray-500">Employee No.</span>
                <span>{item.employee.employeeNo}</span>
              </>
            )}
            <span className="text-gray-500">Working Days</span>
            <span>{item.workingDays}</span>
            <span className="text-gray-500">Days Present</span>
            <span>{item.workingDays - item.absentDays}</span>
            <span className="text-gray-500">Days Absent</span>
            <span>{item.absentDays}</span>
            {item.otDays > 0 && (
              <>
                <span className="text-gray-500">OT Days</span>
                <span>{item.otDays}</span>
              </>
            )}
          </div>
        </div>

        {/* Earnings */}
        <div className="mb-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Earnings</h2>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Basic Salary</span>
              <span>{item.basicSalary.toLocaleString()} MMK</span>
            </div>
            {item.absenceDeduction > 0 && (
              <div className="flex justify-between text-red-500">
                <span>Absence Deduction ({netAbsent} day{netAbsent !== 1 ? "s" : ""} × {item.dailyRate.toLocaleString()})</span>
                <span>−{item.absenceDeduction.toLocaleString()} MMK</span>
              </div>
            )}
            {item.otPremium > 0 && (
              <div className="flex justify-between text-purple-600">
                <span>OT Premium ({Math.max(0, item.otDays - item.absentDays)} day × 0.5×)</span>
                <span>+{item.otPremium.toLocaleString()} MMK</span>
              </div>
            )}
            {earnedBonus && (
              <div className="flex justify-between text-green-600">
                <span>Attendance Bonus (perfect attendance)</span>
                <span>+{item.attendanceBonusAmt.toLocaleString()} MMK</span>
              </div>
            )}
            {adHocRows.map((b) => (
              <div key={b.id} className="flex justify-between text-green-600">
                <span>{b.label}</span>
                <span>+{b.amount.toLocaleString()} MMK</span>
              </div>
            ))}
          </div>
        </div>

        {/* Deductions */}
        {(advanceInstalments.length > 0 || fines.length > 0) && (
          <div className="mb-4 border-t pt-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Deductions</h2>
            <div className="space-y-1 text-sm">
              {advanceInstalments.map((inst) => (
                <div key={inst.id} className="flex justify-between text-red-500">
                  <span>Advance repayment{inst.advance.note ? ` (${inst.advance.note})` : ""}</span>
                  <span>−{inst.amount.toLocaleString()} MMK</span>
                </div>
              ))}
              {fines.map((f) => (
                <div key={f.id} className="flex justify-between text-red-500">
                  <span>Fine: {f.reason}</span>
                  <span>−{f.amount.toLocaleString()} MMK</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Net pay */}
        <div className="border-t pt-4">
          <div className="flex items-center justify-between">
            <span className="font-bold">Net Pay</span>
            <span className="text-lg font-bold text-brand">{item.netPay.toLocaleString()} MMK</span>
          </div>
        </div>

        {/* Status */}
        <div className="mt-6 text-center text-xs text-gray-400">
          {payroll.status === "LOCKED" ? "✓ Approved payroll" : "Draft — not yet approved"}
        </div>
      </div>
    </div>
  );
}
