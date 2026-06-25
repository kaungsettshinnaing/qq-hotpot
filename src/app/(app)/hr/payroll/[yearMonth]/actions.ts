"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAttendanceSummary } from "@/lib/hr-attendance";
import { computePayrollItem } from "@/lib/hr-payroll";

function parseYearMonth(slug: string): { year: number; month: number } {
  const [y, m] = slug.split("-").map(Number);
  return { year: y, month: m };
}

export async function generatePayroll(fd: FormData) {
  const session = await requireAnyRole(["HR", "ADMIN"]);
  const slug = fd.get("yearMonth") as string;
  const { year, month } = parseYearMonth(slug);

  // Ensure a Payroll record exists (upsert)
  const payroll = await prisma.payroll.upsert({
    where: { month_year: { month, year } },
    update: {},
    create: { month, year, status: "DRAFT" },
  });

  if (payroll.status === "LOCKED") {
    throw new Error("Cannot regenerate a locked payroll.");
  }

  const employees = await prisma.employee.findMany({
    where: { isActive: true },
  });

  for (const emp of employees) {
    const { workingDays, absentDays, otDays } = await getAttendanceSummary(
      emp.userId, year, month, emp.restDays,
    );

    const adHocRows = await prisma.adHocBonus.findMany({
      where: { employeeId: emp.userId, month, year },
    });
    const adHocBonuses = adHocRows.reduce((s, b) => s + b.amount, 0);

    const advanceInstalments = await prisma.advanceInstalment.findMany({
      where: { advance: { employeeId: emp.userId }, month, year },
    });
    const advanceDeduction = advanceInstalments.reduce((s, i) => s + i.amount, 0);

    const fines = await prisma.employeeFine.findMany({
      where: { employeeId: emp.userId, deductMonth: month, deductYear: year },
    });
    const fineDeduction = fines.reduce((s, f) => s + f.amount, 0);

    const result = computePayrollItem({
      basicSalary: emp.basicSalary,
      workingDays,
      absentDays,
      otDays,
      attendanceBonusAmt: emp.attendanceBonus,
      adHocBonuses,
      advanceDeduction,
      fineDeduction,
    });

    await prisma.payrollItem.upsert({
      where: { payrollId_employeeId: { payrollId: payroll.id, employeeId: emp.userId } },
      update: {
        basicSalary: emp.basicSalary,
        workingDays,
        absentDays,
        otDays,
        attendanceBonusAmt: emp.attendanceBonus,
        dailyRate: result.dailyRate,
        absenceDeduction: result.absenceDeduction,
        otPremium: result.otPremium,
        adHocBonuses,
        advanceDeduction,
        fineDeduction,
        netPay: result.netPay,
      },
      create: {
        payrollId: payroll.id,
        employeeId: emp.userId,
        basicSalary: emp.basicSalary,
        workingDays,
        absentDays,
        otDays,
        attendanceBonusAmt: emp.attendanceBonus,
        dailyRate: result.dailyRate,
        absenceDeduction: result.absenceDeduction,
        otPremium: result.otPremium,
        adHocBonuses,
        advanceDeduction,
        fineDeduction,
        netPay: result.netPay,
      },
    });
  }

  revalidatePath(`/hr/payroll/${slug}`);
}

export async function lockPayroll(fd: FormData) {
  const session = await requireAnyRole(["HR", "ADMIN"]);
  const slug = fd.get("yearMonth") as string;
  const { year, month } = parseYearMonth(slug);

  const payroll = await prisma.payroll.findUnique({ where: { month_year: { month, year } } });
  if (!payroll || payroll.status === "LOCKED") return;

  await prisma.payroll.update({
    where: { id: payroll.id },
    data: { status: "LOCKED", lockedById: session.id, lockedAt: new Date() },
  });

  // Mark advance instalments as deducted
  const items = await prisma.payrollItem.findMany({ where: { payrollId: payroll.id } });
  for (const item of items) {
    await prisma.advanceInstalment.updateMany({
      where: { advance: { employeeId: item.employeeId }, month, year },
      data: { deducted: true },
    });
    await prisma.employeeFine.updateMany({
      where: { employeeId: item.employeeId, deductMonth: month, deductYear: year },
      data: { deducted: true },
    });
  }

  revalidatePath(`/hr/payroll/${slug}`);
  revalidatePath("/hr/payroll");
}
