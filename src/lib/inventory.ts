import { prisma } from "@/lib/db";

export async function computeStockLevel(stockItemId: string): Promise<number> {
  const result = await prisma.stockMovement.aggregate({
    where: { stockItemId },
    _sum: { qty: true },
  });
  return result._sum.qty ?? 0;
}

export async function computeAllStockLevels(): Promise<Map<string, number>> {
  const movements = await prisma.stockMovement.groupBy({
    by: ["stockItemId"],
    _sum: { qty: true },
  });
  return new Map(movements.map((m) => [m.stockItemId, m._sum.qty ?? 0]));
}
