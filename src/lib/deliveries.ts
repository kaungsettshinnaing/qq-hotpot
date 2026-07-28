import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";

type Tx = Prisma.TransactionClient | PrismaClient;

// Blind-count reconciliation is the verification step for stock invoices:
// once a delivery completes, its linked Expense no longer needs manual
// manager confirmation.
export async function confirmLinkedExpense(deliveryId: string, actorId: string, tx: Tx = prisma): Promise<void> {
  const delivery = await tx.stockDelivery.findUnique({
    where: { id: deliveryId },
    select: { expenseId: true },
  });
  if (!delivery?.expenseId) return;
  await tx.expense.updateMany({
    where: { id: delivery.expenseId, confirmedAt: null },
    data: { confirmedAt: new Date(), confirmedById: actorId },
  });
}

// Compare cashier (invoice) vs counter (physical) quantities for STOCK items.
// All match → credit stock and complete; any mismatch → flag for manager review.
export async function runComparison(deliveryId: string, actorId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Atomically claim the delivery while it's still OPEN — a double-click,
    // retry, or concurrent call landing here after it's already been
    // compared (PENDING_REVIEW/PARTIAL/COMPLETE) becomes a no-op instead of
    // crediting stock a second time. The provisional PENDING_REVIEW is
    // overwritten below once the actual outcome (match vs. discrepancy) is
    // known.
    const claimed = await tx.stockDelivery.updateMany({
      where: { id: deliveryId, status: "OPEN" },
      data: { status: "PENDING_REVIEW" },
    });
    if (claimed.count !== 1) return;

    const items = await tx.stockDeliveryItem.findMany({
      where: { deliveryId, stockItemId: { not: null } },
    });
    const hasDiscrepancy = items.some(
      (item) => item.cashierQty != null && item.counterQty != null && item.cashierQty !== item.counterQty
    );
    if (hasDiscrepancy) {
      await tx.stockDeliveryLog.create({
        data: { deliveryId, actorId, action: "DISCREPANCY_FLAGGED",
          note: "Quantities differ between cashier and counter — manager review required" },
      });
      // Status stays PENDING_REVIEW, as set by the claim above.
    } else {
      for (const item of items) {
        if (item.cashierQty != null && item.stockItemId) {
          await tx.stockDeliveryItem.update({
            where: { id: item.id },
            data: { finalQty: item.cashierQty },
          });
          await tx.stockMovement.create({
            data: {
              stockItemId: item.stockItemId,
              type: "DELIVERY_IN",
              qty: item.cashierQty,
              deliveryId,
              recordedById: actorId,
            },
          });
        }
      }
      await tx.stockDelivery.update({
        where: { id: deliveryId },
        data: { status: "COMPLETE" },
      });
      await tx.stockDeliveryLog.create({
        data: { deliveryId, actorId, action: "AUTO_COMPLETED",
          note: "All quantities matched — auto-completed" },
      });
      await confirmLinkedExpense(deliveryId, actorId, tx);
    }
  });
}
