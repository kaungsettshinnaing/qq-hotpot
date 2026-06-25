import { prisma } from "./db";

export async function getOpenShift(cashierId: string) {
  return prisma.cashierShift.findFirst({
    where: { cashierId, status: "OPEN" },
    orderBy: { openedAt: "desc" },
  });
}

export interface ShiftTotals {
  cashSales: number;
  otherSales: number;
  cashExpenses: number;
  expected: number;
}

/** Expected cash in drawer = float + cash sales − cash-drawer expenses. */
export async function computeShiftTotals(
  shiftId: string,
  openingFloat: number,
): Promise<ShiftTotals> {
  const [cashAgg, otherAgg, expAgg] = await Promise.all([
    prisma.payment.aggregate({ _sum: { amount: true }, where: { shiftId, method: "CASH" } }),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { shiftId, method: { in: ["KBZPAY", "OTHER"] } } }),
    prisma.expense.aggregate({ _sum: { amount: true }, where: { shiftId, paymentSource: "CASH_DRAWER" } }),
  ]);
  const cashSales = cashAgg._sum.amount ?? 0;
  const otherSales = otherAgg._sum.amount ?? 0;
  const cashExpenses = expAgg._sum.amount ?? 0;
  return { cashSales, otherSales, cashExpenses, expected: openingFloat + cashSales - cashExpenses };
}
