"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAttendanceSummary } from "@/lib/hr-attendance";
import { allocateDeductions, computePayrollItem } from "@/lib/hr-payroll";
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

    // Deduct only what is scheduled against THIS month. An instalment or fine
    // booked for an earlier month is that month's payroll to collect — it is
    // never silently pulled forward into a later one, because the payslip an
    // employee is handed has to match the month printed on it.
    //
    // Consequence, by design: if a month's payroll is never locked, its
    // instalments stay outstanding and no later month sweeps them up. HR
    // reschedules them from HR › Salary Advances if they still need
    // collecting. This is a preview sum only — lockPayroll does the real
    // (order-sensitive) collection.
    const advanceInstalments = await prisma.advanceInstalment.findMany({
      where: { advance: { employeeId: emp.userId }, deducted: false, month, year },
    });
    const advanceDeduction = advanceInstalments.reduce((s, i) => s + i.amount, 0);

    const fines = await prisma.employeeFine.findMany({
      where: { employeeId: emp.userId, deducted: false, deductMonth: month, deductYear: year },
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
        grossPay: result.grossPay,
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
        grossPay: result.grossPay,
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

    const items = await tx.payrollItem.findMany({ where: { payrollId: payroll.id } });
    for (const item of items) {
      // Collect only what is scheduled against this month — same rule as
      // generatePayroll above, so the locked figures match the draft the HR
      // user approved. Whatever grossPay can cover is taken oldest-first,
      // each row atomic (collected in full or left untouched) so nothing
      // needs fractional tracking. A row that doesn't fit stays outstanding
      // for HR to reschedule. Fines come before advances since they're
      // disciplinary — a judgment call, easy to flip.
      const outstandingFines = await tx.employeeFine.findMany({
        where: {
          employeeId: item.employeeId,
          deducted: false,
          deductMonth: month,
          deductYear: year,
        },
        orderBy: [{ createdAt: "asc" }],
      });
      const outstandingInstalments = await tx.advanceInstalment.findMany({
        where: {
          advance: { employeeId: item.employeeId },
          deducted: false,
          month,
          year,
        },
        orderBy: [{ id: "asc" }],
      });

      const {
        collectedFines,
        collectedAdvances,
        fineDeduction: actualFineDeduction,
        advanceDeduction: actualAdvanceDeduction,
        netPay,
      } = allocateDeductions(item.grossPay, outstandingFines, outstandingInstalments);

      // Stamp the month that actually collected each row, not just a
      // deducted flag — the payslip needs to show a carried-forward
      // instalment on the payslip that paid it, not the one it was
      // originally scheduled against.
      if (collectedFines.length > 0) {
        await tx.employeeFine.updateMany({
          where: { id: { in: collectedFines.map((f) => f.id) } },
          data: { deducted: true, deductedMonth: month, deductedYear: year },
        });
      }
      if (collectedAdvances.length > 0) {
        await tx.advanceInstalment.updateMany({
          where: { id: { in: collectedAdvances.map((i) => i.id) } },
          data: { deducted: true, deductedMonth: month, deductedYear: year },
        });
      }

      await tx.payrollItem.update({
        where: { id: item.id },
        data: { advanceDeduction: actualAdvanceDeduction, fineDeduction: actualFineDeduction, netPay },
      });
      await postPayrollItem(
        tx,
        { id: item.id, netPay, advanceDeduction: actualAdvanceDeduction, fineDeduction: actualFineDeduction },
        lockedAt,
      );
    }
  });

  revalidatePath(`/hr/payroll/${slug}`);
  revalidatePath("/hr/payroll");
}
