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

    // Roll forward anything still outstanding from an earlier month — not
    // just this month's scheduled instalments/fines — so a shortfall that
    // lockPayroll couldn't fully collect (see lockPayroll below) gets a
    // repeat attempt instead of silently disappearing. This is a preview
    // sum only; lockPayroll does the real (order-sensitive) collection.
    const advanceInstalments = await prisma.advanceInstalment.findMany({
      where: {
        advance: { employeeId: emp.userId },
        deducted: false,
        OR: [{ year: { lt: year } }, { year, month: { lte: month } }],
      },
    });
    const advanceDeduction = advanceInstalments.reduce((s, i) => s + i.amount, 0);

    const fines = await prisma.employeeFine.findMany({
      where: {
        employeeId: emp.userId,
        deducted: false,
        OR: [{ deductYear: { lt: year } }, { deductYear: year, deductMonth: { lte: month } }],
      },
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
      // Collect whatever grossPay can actually cover, oldest-first, treating
      // each fine/instalment as an atomic unit (either fully collected this
      // month or left untouched) — never partially deduct one, so nothing
      // needs fractional tracking. Anything that doesn't fit stays
      // deducted:false and is picked up again by next month's generatePayroll
      // (which now looks back for any outstanding row, not just this
      // month's). Fines are given priority over advances since they're
      // disciplinary; this is a judgment call, easy to flip if the business
      // wants advances collected first instead.
      const outstandingFines = await tx.employeeFine.findMany({
        where: {
          employeeId: item.employeeId,
          deducted: false,
          OR: [{ deductYear: { lt: year } }, { deductYear: year, deductMonth: { lte: month } }],
        },
        orderBy: [{ deductYear: "asc" }, { deductMonth: "asc" }, { createdAt: "asc" }],
      });
      const outstandingInstalments = await tx.advanceInstalment.findMany({
        where: {
          advance: { employeeId: item.employeeId },
          deducted: false,
          OR: [{ year: { lt: year } }, { year, month: { lte: month } }],
        },
        orderBy: [{ year: "asc" }, { month: "asc" }, { id: "asc" }],
      });

      let available = Math.max(0, item.grossPay);
      let actualFineDeduction = 0;
      for (const fine of outstandingFines) {
        if (fine.amount > available) break; // this and every later (larger-or-equal-age) one waits for next month
        await tx.employeeFine.update({ where: { id: fine.id }, data: { deducted: true } });
        available -= fine.amount;
        actualFineDeduction += fine.amount;
      }

      let actualAdvanceDeduction = 0;
      for (const inst of outstandingInstalments) {
        if (inst.amount > available) break;
        await tx.advanceInstalment.update({ where: { id: inst.id }, data: { deducted: true } });
        available -= inst.amount;
        actualAdvanceDeduction += inst.amount;
      }

      const netPay = available;
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
