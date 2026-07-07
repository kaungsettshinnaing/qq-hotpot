import { prisma } from "./db";

export async function getOpenShift(cashierId: string) {
  return prisma.cashierShift.findFirst({
    where: { cashierId, status: "OPEN" },
    orderBy: { openedAt: "desc" },
  });
}

/** Returns whichever shift is currently open, regardless of which cashier opened it. */
export async function getAnyOpenShift() {
  return prisma.cashierShift.findFirst({
    where: { status: "OPEN" },
    orderBy: { openedAt: "desc" },
    include: { cashier: { select: { name: true } } },
  });
}

export interface ShiftTotals {
  cashSales: number;
  kbzSales: number;
  otherSales: number;
  cashExpenses: number;
  cashInjected: number;
  cashWithdrawn: number;
  expected: number;
}

/** Full breakdown of payments and expected cash for a shift.
 *  Pass shiftWindow to enable accurate change deduction from cashSales. */
export async function computeShiftTotals(
  shiftId: string,
  openingFloat: number,
  shiftWindow?: { openedAt: Date; closedAt: Date | null },
): Promise<ShiftTotals> {
  const [cashAgg, kbzAgg, otherAgg, expAgg, injectAgg, collectAgg] = await Promise.all([
    prisma.payment.aggregate({ _sum: { amount: true }, where: { shiftId, method: "CASH" } }),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { shiftId, method: "KBZPAY" } }),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { shiftId, method: "OTHER" } }),
    prisma.expense.aggregate({ _sum: { amount: true }, where: { shiftId, paymentSource: "CASH_DRAWER" } }),
    prisma.cashCollection.aggregate({ _sum: { amount: true }, where: { shiftId, type: "INJECT" } }),
    prisma.cashCollection.aggregate({ _sum: { amount: true }, where: { shiftId, type: "COLLECT" } }),
  ]);
  const kbzSales = kbzAgg._sum.amount ?? 0;
  const otherSales = otherAgg._sum.amount ?? 0;
  const cashExpenses = expAgg._sum.amount ?? 0;
  const cashInjected = injectAgg._sum.amount ?? 0;
  const cashWithdrawn = collectAgg._sum.amount ?? 0;

  // Gross CASH collected; reduced by change returned when customers overpay.
  // We attribute change to the shift that settled the session (closedAt in window).
  let cashSales = cashAgg._sum.amount ?? 0;
  if (shiftWindow) {
    const settled = await prisma.tableSession.findMany({
      where: {
        status: "CLOSED",
        billTotal: { not: null },
        closedAt: { gte: shiftWindow.openedAt, lt: shiftWindow.closedAt ?? new Date() },
        payments: { some: { shiftId, method: "CASH" } },
      },
      select: { billTotal: true, payments: { select: { amount: true } } },
    });
    for (const s of settled) {
      const totalPaid = s.payments.reduce((sum, p) => sum + p.amount, 0);
      cashSales -= Math.max(0, totalPaid - (s.billTotal ?? totalPaid));
    }
  }

  return {
    cashSales, kbzSales, otherSales, cashExpenses, cashInjected, cashWithdrawn,
    expected: openingFloat + cashSales - cashExpenses + cashInjected - cashWithdrawn,
  };
}

/**
 * Records a manual cash-drawer movement (inject or withdraw), automatically
 * tagging it to whichever shift is currently open (if any). Tagged movements
 * count toward that shift's `expected` cash; untagged ones (no shift open)
 * only affect the standalone cash standing (getCashStanding below).
 */
export async function createCashMovement(
  type: "INJECT" | "COLLECT",
  amount: number,
  note: string | null,
  recordedById: string,
) {
  const openShift = await getAnyOpenShift();
  return prisma.cashCollection.create({
    data: { type, amount, note, recordedById, shiftId: openShift?.id ?? null },
  });
}

/**
 * Current cash standing in the physical drawer.
 * = last closed shift's expectedCash (or 0) + injections − collections since then.
 */
export async function getCashStanding(): Promise<number> {
  const lastShift = await prisma.cashierShift.findFirst({
    where: { status: "CLOSED" },
    orderBy: { closedAt: "desc" },
    select: { closedAt: true, expectedCash: true },
  });

  const sinceDate = lastShift?.closedAt ?? new Date(0);
  // Carry forward the auto-calculated expected cash, not the manually counted
  // figure — a mistyped/miscommunicated count must never silently become the
  // baseline for every subsequent day. countedCash is only ever a discrepancy
  // check against expectedCash, never a source of truth for standing.
  const baseline = lastShift?.expectedCash ?? 0;

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
