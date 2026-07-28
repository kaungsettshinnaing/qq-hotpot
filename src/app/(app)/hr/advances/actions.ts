"use server";

import { revalidatePath } from "next/cache";
import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isPayrollLocked } from "@/lib/payroll-lock";
import { postAdvanceGiven } from "@/lib/journal-postings";

export async function createAdvance(fd: FormData) {
  const session = await requireAnyRole(["HR", "ADMIN", "MANAGER"]);
  const employeeId = fd.get("employeeId") as string;
  const amount = parseInt(fd.get("amount") as string);
  const note = ((fd.get("note") as string) ?? "").trim();
  const month = parseInt(fd.get("month") as string);
  const year = parseInt(fd.get("year") as string);
  if (!employeeId || !amount || !month || !year) return;
  if (await isPayrollLocked(month, year)) {
    throw new Error("Payroll for this month is already locked; cannot add an advance to it.");
  }

  await prisma.$transaction(async (tx) => {
    const advance = await tx.salaryAdvance.create({
      data: { employeeId, totalAmount: amount, note: note || null, createdById: session.id },
    });
    await tx.advanceInstalment.create({
      data: { advanceId: advance.id, month, year, amount },
    });
    await postAdvanceGiven(tx, advance);
  });
  revalidatePath("/hr/advances");
}

export async function addInstalment(fd: FormData) {
  await requireAnyRole(["HR", "ADMIN", "MANAGER"]);
  const advanceId = fd.get("advanceId") as string;
  const month = parseInt(fd.get("month") as string);
  const year = parseInt(fd.get("year") as string);
  const amount = parseInt(fd.get("amount") as string);

  if (await isPayrollLocked(month, year)) {
    throw new Error("Payroll for this month is already locked; cannot add an instalment to it.");
  }

  // createAdvance disburses totalAmount as cash in full up front (one
  // postAdvanceGiven entry) and schedules it as a single instalment — this
  // action only splits that existing repayment schedule across more months,
  // it does not hand out additional money, so no further journal entry is
  // posted here. Guard against scheduling more repayment than was ever
  // actually disbursed.
  const advance = await prisma.salaryAdvance.findUnique({
    where: { id: advanceId },
    include: { instalments: { select: { amount: true } } },
  });
  if (!advance) throw new Error("Advance not found.");
  const alreadyScheduled = advance.instalments.reduce((s, i) => s + i.amount, 0);
  if (alreadyScheduled + amount > advance.totalAmount) {
    throw new Error(
      `This would schedule ${alreadyScheduled + amount} in repayments against an advance of only ${advance.totalAmount} already disbursed.`,
    );
  }

  await prisma.advanceInstalment.create({ data: { advanceId, month, year, amount } });
  revalidatePath("/hr/advances");
}

export async function deleteInstalment(fd: FormData) {
  await requireAnyRole(["HR", "ADMIN", "MANAGER"]);
  const id = fd.get("id") as string;
  const inst = await prisma.advanceInstalment.findUnique({ where: { id } });
  if (!inst || inst.deducted) return;
  await prisma.advanceInstalment.delete({ where: { id } });
  // Clean up parent advance if it has no more instalments
  const remaining = await prisma.advanceInstalment.count({ where: { advanceId: inst.advanceId } });
  if (remaining === 0) await prisma.salaryAdvance.delete({ where: { id: inst.advanceId } });
  revalidatePath("/hr/advances");
}
