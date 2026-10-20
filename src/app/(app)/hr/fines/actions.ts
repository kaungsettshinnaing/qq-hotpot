"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isPayrollLocked, validMoneyMonth, employeeExists } from "@/lib/payroll-lock";

export async function createFine(fd: FormData) {
  const session = await requireAnyRole(["HR", "ADMIN", "MANAGER"]);
  const employeeId = String(fd.get("employeeId") ?? "");
  const amount = parseInt(String(fd.get("amount") ?? ""), 10);
  const reason = String(fd.get("reason") ?? "").trim().slice(0, 300);
  const deductMonth = parseInt(String(fd.get("deductMonth") ?? ""), 10);
  const deductYear = parseInt(String(fd.get("deductYear") ?? ""), 10);

  // The HTML min="1" was the only validation: a negative fine RAISED net pay and
  // wrote a negative journal line, month 13 was never collected, and a bad
  // employee id crashed on the FK.
  if (!validMoneyMonth(amount, deductMonth, deductYear) || !(await employeeExists(employeeId))) {
    redirect("/hr/fines?error=invalid");
  }
  if (await isPayrollLocked(deductMonth, deductYear)) redirect("/hr/fines?error=locked");

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
  if (!fine || fine.deducted) return;
  await prisma.employeeFine.deleteMany({ where: { id } });
  revalidatePath("/hr/fines");
  revalidatePath("/manager");
}
