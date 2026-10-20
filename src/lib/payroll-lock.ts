import { prisma } from "@/lib/db";

export async function isPayrollLocked(month: number, year: number): Promise<boolean> {
  const payroll = await prisma.payroll.findUnique({ where: { month_year: { month, year } } });
  return payroll?.status === "LOCKED";
}

/** Postgres Int overflows at ~2.1 billion; a fine or advance above this is a typo. */
export const MAX_PAYROLL_AMOUNT = 1_000_000_000;

/** Server-side validation for a fine / advance / instalment form: a positive whole
 *  amount within range, a real calendar month and a plausible year. The HTML
 *  `min="1"` on the inputs is advice to the browser, not a rule. */
export function validMoneyMonth(amount: number, month: number, year: number): boolean {
  return (
    Number.isInteger(amount) && amount > 0 && amount <= MAX_PAYROLL_AMOUNT &&
    Number.isInteger(month) && month >= 1 && month <= 12 &&
    Number.isInteger(year) && year >= 2020 && year <= 2100
  );
}

export async function employeeExists(employeeId: string): Promise<boolean> {
  if (!employeeId) return false;
  return !!(await prisma.employee.findUnique({ where: { userId: employeeId }, select: { userId: true } }));
}
