import { prisma } from "./db";

export async function getOpenShift(cashierId: string) {
  return prisma.cashierShift.findFirst({
    where: { cashierId, status: "OPEN" },
    orderBy: { openedAt: "desc" },
  });
}

export interface ShiftTotals {
  cashSales: number;
  kbzSales: number;
  otherSales: number;
  cashExpenses: number;
  expected: number;
}

/** Full breakdown of payments and expected cash for a shift. */
export async function computeShiftTotals(
  shiftId: string,
  openingFloat: number,
): Promise<ShiftTotals> {
  const [cashAgg, kbzAgg, otherAgg, expAgg] = await Promise.all([
    prisma.payment.aggregate({ _sum: { amount: true }, where: { shiftId, method: "CASH" } }),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { shiftId, method: "KBZPAY" } }),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { shiftId, method: "OTHER" } }),
    prisma.expense.aggregate({ _sum: { amount: true }, where: { shiftId, paymentSource: "CASH_DRAWER" } }),
  ]);
  const cashSales = cashAgg._sum.amount ?? 0;
  const kbzSales = kbzAgg._sum.amount ?? 0;
  const otherSales = otherAgg._sum.amount ?? 0;
  const cashExpenses = expAgg._sum.amount ?? 0;
  return { cashSales, kbzSales, otherSales, cashExpenses, expected: openingFloat + cashSales - cashExpenses };
}

/**
 * Current cash standing in the physical drawer.
 * = last closed shift's countedCash (or 0) + injections − collections since then.
 */
export async function getCashStanding(): Promise<number> {
  const lastShift = await prisma.cashierShift.findFirst({
    where: { status: "CLOSED" },
    orderBy: { closedAt: "desc" },
    select: { closedAt: true, countedCash: true },
  });

  const sinceDate = lastShift?.closedAt ?? new Date(0);
  const baseline = lastShift?.countedCash ?? 0;

  const [injectAgg, collectAgg] = await Promise.all([
    prisma.cashCollection.aggregate({
      _sum: { amount: true },
      where: { type: "INJECT", createdAt: { gt: sinceDate } },
    }),
    prisma.cashCollection.aggregate({
      _sum: { amount: true },
      where: { type: "COLLECT", createdAt: { gt: sinceDate } },
    }),
  ]);

  return baseline + (injectAgg._sum.amount ?? 0) - (collectAgg._sum.amount ?? 0);
}
