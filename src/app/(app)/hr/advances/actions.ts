"use server";

import { revalidatePath } from "next/cache";
import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function createAdvance(fd: FormData) {
  const session = await requireAnyRole(["HR", "ADMIN", "MANAGER"]);
  const employeeId = fd.get("employeeId") as string;
  const amount = parseInt(fd.get("amount") as string);
  const note = ((fd.get("note") as string) ?? "").trim();
  const month = parseInt(fd.get("month") as string);
  const year = parseInt(fd.get("year") as string);
  if (!employeeId || !amount || !month || !year) return;

  const advance = await prisma.salaryAdvance.create({
    data: { employeeId, totalAmount: amount, note: note || null, createdById: session.id },
  });
  await prisma.advanceInstalment.create({
    data: { advanceId: advance.id, month, year, amount },
  });
  revalidatePath("/hr/advances");
}

export async function addInstalment(fd: FormData) {
  await requireAnyRole(["HR", "ADMIN", "MANAGER"]);
  const advanceId = fd.get("advanceId") as string;
  const month = parseInt(fd.get("month") as string);
  const year = parseInt(fd.get("year") as string);
  const amount = parseInt(fd.get("amount") as string);

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
