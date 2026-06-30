"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";

function posFloat(v: unknown): number {
  const n = parseFloat(String(v ?? ""));
  return Number.isNaN(n) || n <= 0 ? 0 : n;
}

export async function createStockIn(formData: FormData): Promise<void> {
  const session = await requireSession();

  const itemIds    = formData.getAll("itemId").map(String);
  const qtys       = formData.getAll("qty").map((v) => posFloat(v));
  const units      = formData.getAll("unit").map(String);

  const entries = itemIds
    .map((itemId, i) => ({ itemId, qty: qtys[i], unit: units[i]?.trim() || null }))
    .filter((e) => e.itemId && e.qty > 0);

  if (entries.length === 0) redirect("/inventory/deliveries/new?error=no_items");

  // Create delivery header — auto-complete, no cashier/counter workflow
  const delivery = await prisma.stockDelivery.create({
    data: {
      deliveryDate: new Date(),
      invoiceType: "STOCK",
      status: "COMPLETE",
      paymentStatus: "UNPAID",
      createdById: session.id,
    },
  });

  // Create items + stock movements
  for (const entry of entries) {
    const qty = Math.round(entry.qty);
    await prisma.stockDeliveryItem.create({
      data: {
        deliveryId: delivery.id,
        stockItemId: entry.itemId,
        finalQty: qty,
        cashierQty: qty,
        unitLabel: entry.unit,
      },
    });
    await prisma.stockMovement.create({
      data: {
        stockItemId: entry.itemId,
        type: "DELIVERY_IN",
        qty,
        deliveryId: delivery.id,
        recordedById: session.id,
      },
    });
  }

  await prisma.stockDeliveryLog.create({
    data: {
      deliveryId: delivery.id,
      actorId: session.id,
      action: "AUTO_COMPLETED",
      note: `Stock-in: ${entries.length} item(s)`,
    },
  });

  revalidatePath("/inventory");
  revalidatePath("/inventory/deliveries");
  redirect("/inventory/deliveries");
}
