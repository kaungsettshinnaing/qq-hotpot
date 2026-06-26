"use server";

import { revalidatePath } from "next/cache";
import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function createFine(fd: FormData) {
  const session = await requireAnyRole(["HR", "ADMIN", "MANAGER"]);
  const employeeId = fd.get("employeeId") as string;
  const amount = parseInt(fd.get("amount") as string);
  const reason = (fd.get("reason") as string).trim();
  const deductMonth = parseInt(fd.get("deductMonth") as string);
  const deductYear = parseInt(fd.get("deductYear") as string);

  await prisma.employeeFine.create({
    data: { employeeId, amount, reason, deductMonth, deductYear, createdById: session.id },
  });
  revalidatePath("/hr/fines");
  revalidatePath("/manager");
}

export async function deleteFine(fd: FormData) {
  await requireAnyRole(["HR", "ADMIN", "MANAGER"]);
  const id = fd.get("id") as string;
  const fine = await prisma.employeeFine.findUnique({ where: { id } });
  if (fine?.deducted) return;
  await prisma.employeeFine.delete({ where: { id } });
  revalidatePath("/hr/fines");
  revalidatePath("/manager");
}
