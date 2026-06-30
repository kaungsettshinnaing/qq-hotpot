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

  // Merge duplicate itemIds by summing qty
  const merged = new Map<string, { qty: number; unit: string | null }>();
  for (const e of entries) {
    const prev = merged.get(e.itemId);
    merged.set(e.itemId, { qty: (prev?.qty ?? 0) + e.qty, unit: e.unit ?? prev?.unit ?? null });
  }
  const mergedEntries = Array.from(merged.entries()).map(([itemId, v]) => ({ itemId, ...v }));

  // Create delivery header — stays OPEN until manager approves
  const delivery = await prisma.stockDelivery.create({
    data: {
      deliveryDate: new Date(),
      invoiceType: "STOCK",
      status: "OPEN",
      paymentStatus: "UNPAID",
      createdById: session.id,
    },
  });

  // Create items only (no stock movements yet — manager approves before stock is credited)
  for (const entry of mergedEntries) {
    const qty = Math.round(entry.qty);
    await prisma.stockDeliveryItem.create({
      data: {
        deliveryId: delivery.id,
        stockItemId: entry.itemId,
        cashierQty: qty,
        unitLabel: entry.unit,
      },
    });
  }

  await prisma.stockDeliveryLog.create({
    data: {
      deliveryId: delivery.id,
      actorId: session.id,
      action: "CREATED",
      note: `Stock-in submitted: ${mergedEntries.length} item(s) — awaiting manager approval`,
    },
  });

  revalidatePath("/inventory");
  revalidatePath("/inventory/deliveries");
  redirect("/inventory/deliveries");
}
