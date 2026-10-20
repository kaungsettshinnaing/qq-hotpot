"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isPayrollLocked, validMoneyMonth, employeeExists } from "@/lib/payroll-lock";
import { postAdvanceGiven } from "@/lib/journal-postings";

export async function createAdvance(fd: FormData) {
  const session = await requireAnyRole(["HR", "ADMIN", "MANAGER"]);
  const employeeId = String(fd.get("employeeId") ?? "");
  const amount = parseInt(String(fd.get("amount") ?? ""), 10);
  const note = String(fd.get("note") ?? "").trim().slice(0, 300);
  const month = parseInt(String(fd.get("month") ?? ""), 10);
  const year = parseInt(String(fd.get("year") ?? ""), 10);
  // Server-side validation (a negative advance used to pass and a month of 13 was
  // scheduled against a month that never comes); errors show as a banner instead
  // of a silent return or the blank error page.
  if (!validMoneyMonth(amount, month, year) || !(await employeeExists(employeeId))) {
    redirect("/hr/advances?error=invalid");
  }
  if (await isPayrollLocked(month, year)) redirect("/hr/advances?error=locked");

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
  const advanceId = String(fd.get("advanceId") ?? "");
  const month = parseInt(String(fd.get("month") ?? ""), 10);
  const year = parseInt(String(fd.get("year") ?? ""), 10);
  const amount = parseInt(String(fd.get("amount") ?? ""), 10);

  if (!advanceId || !validMoneyMonth(amount, month, year)) redirect("/hr/advances?error=invalid");
  if (await isPayrollLocked(month, year)) redirect("/hr/advances?error=locked");

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
  if (!advance) redirect("/hr/advances?error=invalid");
  const alreadyScheduled = advance.instalments.reduce((s, i) => s + i.amount, 0);
  if (alreadyScheduled + amount > advance.totalAmount) redirect("/hr/advances?error=invalid");

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
