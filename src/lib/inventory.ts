import { prisma } from "@/lib/db";

/** Movements are floats; summing 0.1-style quantities leaves binary noise
 *  (2.7500000000000004). Three decimals is finer than any unit in use. */
export function roundQty(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export async function computeStockLevel(stockItemId: string): Promise<number> {
  const result = await prisma.stockMovement.aggregate({
    where: { stockItemId },
    _sum: { qty: true },
  });
  return roundQty(result._sum.qty ?? 0);
}

export async function computeAllStockLevels(): Promise<Map<string, number>> {
  const movements = await prisma.stockMovement.groupBy({
    by: ["stockItemId"],
    _sum: { qty: true },
  });
  return new Map(movements.map((m) => [m.stockItemId, roundQty(m._sum.qty ?? 0)]));
}
