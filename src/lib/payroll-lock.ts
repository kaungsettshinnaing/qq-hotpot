import { prisma } from "@/lib/db";

export async function isPayrollLocked(month: number, year: number): Promise<boolean> {
  const payroll = await prisma.payroll.findUnique({ where: { month_year: { month, year } } });
  return payroll?.status === "LOCKED";
}
