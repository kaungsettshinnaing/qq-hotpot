import { prisma } from "@/lib/db";

// Blind-count reconciliation is the verification step for stock invoices:
// once a delivery completes, its linked Expense no longer needs manual
// manager confirmation.
export async function confirmLinkedExpense(deliveryId: string, actorId: string): Promise<void> {
  const delivery = await prisma.stockDelivery.findUnique({
    where: { id: deliveryId },
    select: { expenseId: true },
  });
  if (!delivery?.expenseId) return;
  await prisma.expense.updateMany({
    where: { id: delivery.expenseId, confirmedAt: null },
    data: { confirmedAt: new Date(), confirmedById: actorId },
  });
}

// Compare cashier (invoice) vs counter (physical) quantities for STOCK items.
// All match → credit stock and complete; any mismatch → flag for manager review.
export async function runComparison(deliveryId: string, actorId: string): Promise<void> {
  const items = await prisma.stockDeliveryItem.findMany({
    where: { deliveryId, stockItemId: { not: null } },
  });
  const hasDiscrepancy = items.some(
    (item) => item.cashierQty != null && item.counterQty != null && item.cashierQty !== item.counterQty
  );
  if (hasDiscrepancy) {
    await prisma.stockDelivery.update({
      where: { id: deliveryId },
      data: { status: "PENDING_REVIEW" },
    });
    await prisma.stockDeliveryLog.create({
      data: { deliveryId, actorId, action: "DISCREPANCY_FLAGGED",
        note: "Quantities differ between cashier and counter — manager review required" },
    });
  } else {
    for (const item of items) {
      if (item.cashierQty != null && item.stockItemId) {
        await prisma.stockDeliveryItem.update({
          where: { id: item.id },
          data: { finalQty: item.cashierQty },
        });
        await prisma.stockMovement.create({
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
    await prisma.stockDelivery.update({
      where: { id: deliveryId },
      data: { status: "COMPLETE" },
    });
    await prisma.stockDeliveryLog.create({
      data: { deliveryId, actorId, action: "AUTO_COMPLETED",
        note: "All quantities matched — auto-completed" },
    });
    await confirmLinkedExpense(deliveryId, actorId);
  }
}
