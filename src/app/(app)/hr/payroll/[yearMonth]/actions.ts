"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAttendanceSummary } from "@/lib/hr-attendance";
import { computePayrollItem } from "@/lib/hr-payroll";
import { postPayrollItem } from "@/lib/journal-postings";

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

  // Include anyone active today, plus anyone who left partway through *this*
  // month (endDate set by toggleEmployeeActive on deactivation) — otherwise a
  // deactivation processed before this month's payroll is generated silently
  // drops their final prorated paycheck. Present-basis attendance already
  // correctly zeroes out their post-departure days.
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const employees = await prisma.employee.findMany({
    where: {
      isSystem: false,
      OR: [{ isActive: true }, { endDate: { gte: monthStart } }],
    },
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

  const lockedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.payroll.update({
      where: { id: payroll.id },
      data: { status: "LOCKED", lockedById: session.id, lockedAt },
    });

    // Mark advance instalments as deducted
    const items = await tx.payrollItem.findMany({ where: { payrollId: payroll.id } });
    for (const item of items) {
      await tx.advanceInstalment.updateMany({
        where: { advance: { employeeId: item.employeeId }, month, year },
        data: { deducted: true },
      });
      await tx.employeeFine.updateMany({
        where: { employeeId: item.employeeId, deductMonth: month, deductYear: year },
        data: { deducted: true },
      });
      await postPayrollItem(tx, item, lockedAt);
    }
  });

  revalidatePath(`/hr/payroll/${slug}`);
  revalidatePath("/hr/payroll");
}
