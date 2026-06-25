"use server";

import { revalidatePath } from "next/cache";
import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function createAdvance(fd: FormData) {
  const session = await requireAnyRole(["HR", "ADMIN"]);
  const employeeId = fd.get("employeeId") as string;
  const totalAmount = parseInt(fd.get("totalAmount") as string);
  const note = (fd.get("note") as string | null) ?? "";

  await prisma.salaryAdvance.create({
    data: { employeeId, totalAmount, note: note || null, createdById: session.id },
  });
  revalidatePath("/hr/advances");
}

export async function addInstalment(fd: FormData) {
  await requireAnyRole(["HR", "ADMIN"]);
  const advanceId = fd.get("advanceId") as string;
  const month = parseInt(fd.get("month") as string);
  const year = parseInt(fd.get("year") as string);
  const amount = parseInt(fd.get("amount") as string);

  await prisma.advanceInstalment.create({ data: { advanceId, month, year, amount } });
  revalidatePath("/hr/advances");
}

export async function deleteInstalment(fd: FormData) {
  await requireAnyRole(["HR", "ADMIN"]);
  const id = fd.get("id") as string;
  const inst = await prisma.advanceInstalment.findUnique({ where: { id } });
  if (inst?.deducted) return; // cannot remove already-deducted
  await prisma.advanceInstalment.delete({ where: { id } });
  revalidatePath("/hr/advances");
}
