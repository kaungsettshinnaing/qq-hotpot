"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession, requireAnyRole } from "@/lib/auth";
import { computeAllStockLevels } from "@/lib/inventory";
import { mmTodayUTC } from "@/lib/business-day";

// ── Stock expense confirmation ──────────────────────────────────────────────

export async function confirmExpense(formData: FormData): Promise<void> {
  const session = await requireSession();
  await requireAnyRole(["MANAGER", "ADMIN"]);
  const expenseId = String(formData.get("expenseId") ?? "").trim();
  if (!expenseId) return;
  await prisma.expense.update({
    where: { id: expenseId },
    data: { confirmedAt: new Date(), confirmedById: session.id },
  });
  revalidatePath("/manager/inventory");
  revalidatePath("/reports");
  revalidatePath("/accounting");
}

// ── Stock-in delivery approval ──────────────────────────────────────────────

export async function approveStockIn(formData: FormData): Promise<void> {
  const session = await requireSession();
  await requireAnyRole(["MANAGER", "ADMIN"]);
  const deliveryId = String(formData.get("deliveryId") ?? "").trim();
  if (!deliveryId) return;

  const delivery = await prisma.stockDelivery.findUnique({
    where: { id: deliveryId },
    include: { items: { where: { stockItemId: { not: null } } } },
  });
  if (!delivery || delivery.status !== "OPEN") return;

  for (const item of delivery.items) {
    if (!item.stockItemId || !item.cashierQty) continue;
    const qty = item.cashierQty;
    await prisma.stockDeliveryItem.update({
      where: { id: item.id },
      data: { finalQty: qty, counterQty: qty },
    });
    await prisma.stockMovement.create({
      data: {
        stockItemId: item.stockItemId,
        type: "DELIVERY_IN",
        qty,
        deliveryId: delivery.id,
        recordedById: session.id,
      },
    });
  }

  await prisma.stockDelivery.update({
    where: { id: deliveryId },
    data: { status: "COMPLETE" },
  });

  await prisma.stockDeliveryLog.create({
    data: {
      deliveryId,
      actorId: session.id,
      action: "MANAGER_APPROVED",
      note: `Approved by manager — stock credited for ${delivery.items.length} item(s)`,
    },
  });

  revalidatePath("/manager/inventory");
  revalidatePath("/inventory");
  revalidatePath("/inventory/deliveries");
}

function str(v: unknown, max = 500): string {
  return String(v ?? "").trim().slice(0, max);
}
function posInt(v: unknown): number {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isNaN(n) || n < 0 ? 0 : n;
}

export async function startSpotCheck(): Promise<void> {
  const session = await requireSession();
  await requireAnyRole(["MANAGER", "ADMIN"]);

  const today = mmTodayUTC();

  // Don't create a second count if one already exists today
  const existing = await prisma.stockCount.findFirst({
    where: { date: today, type: "SPOT", completedAt: null },
  });
  if (existing) {
    revalidatePath("/manager/inventory");
    redirect("/manager/inventory?tab=spot-check");
  }

  const activeItems = await prisma.stockItem.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  if (activeItems.length === 0) redirect("/manager/inventory?tab=spot-check&error=no_items");

  // Randomly select at least 5% of items (minimum 1)
  const minCount = Math.max(1, Math.ceil(activeItems.length * 0.05));
  const shuffled = [...activeItems].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, minCount);

  // Get current stock levels
  const levels = await computeAllStockLevels();

  const count = await prisma.stockCount.create({
    data: {
      date: today,
      type: "SPOT",
      createdById: session.id,
      items: {
        create: selected.map((item) => ({
          stockItemId: item.id,
          systemQty: levels.get(item.id) ?? 0,
        })),
      },
    },
  });

  revalidatePath("/manager/inventory");
  redirect(`/manager/inventory?tab=spot-check&countId=${count.id}`);
}

export async function startWeeklyCount(): Promise<void> {
  const session = await requireSession();
  await requireAnyRole(["MANAGER", "ADMIN"]);

  const today = mmTodayUTC();

  const existing = await prisma.stockCount.findFirst({
    where: { date: today, type: "WEEKLY", completedAt: null },
  });
  if (existing) {
    revalidatePath("/manager/inventory");
    redirect("/manager/inventory?tab=weekly");
  }

  const activeItems = await prisma.stockItem.findMany({
    where: { isActive: true },
    select: { id: true },
    orderBy: { name: "asc" },
  });

  if (activeItems.length === 0) redirect("/manager/inventory?tab=weekly&error=no_items");

  const levels = await computeAllStockLevels();

  const count = await prisma.stockCount.create({
    data: {
      date: today,
      type: "WEEKLY",
      createdById: session.id,
      items: {
        create: activeItems.map((item) => ({
          stockItemId: item.id,
          systemQty: levels.get(item.id) ?? 0,
        })),
      },
    },
  });

  revalidatePath("/manager/inventory");
  redirect(`/manager/inventory?tab=weekly&countId=${count.id}`);
}

export async function submitStockCount(formData: FormData): Promise<void> {
  const session = await requireSession();
  await requireAnyRole(["MANAGER", "ADMIN"]);

  const countId = str(formData.get("countId"));
  const note = str(formData.get("note"), 500);

  const count = await prisma.stockCount.findUniqueOrThrow({
    where: { id: countId },
    include: { items: { include: { stockItem: { select: { id: true } } } } },
  });

  if (count.completedAt) redirect("/manager/inventory?error=already_completed");

  // Get current stock levels for previousQty on adjustments
  const levels = await computeAllStockLevels();

  for (const item of count.items) {
    const confirmedRaw = formData.get(`confirm_${item.id}`);
    const actualQtyRaw = formData.get(`actual_${item.id}`);

    const confirmed = confirmedRaw === "on";
    const actualQty = actualQtyRaw !== null && actualQtyRaw !== "" ? posInt(actualQtyRaw) : null;

    const resolvedActual = confirmed ? item.systemQty : (actualQty ?? null);

    await prisma.stockCountItem.update({
      where: { id: item.id },
      data: {
        confirmed,
        actualQty: resolvedActual,
      },
    });

    // Create adjustment movement if actual differs from system
    if (resolvedActual !== null && resolvedActual !== item.systemQty) {
      const diff = resolvedActual - item.systemQty;
      const currentLevel = levels.get(item.stockItemId) ?? 0;
      await prisma.stockMovement.create({
        data: {
          stockItemId: item.stockItemId,
          type: "ADJUSTMENT",
          qty: diff,
          previousQty: currentLevel,
          note: `Stock count adjustment (${count.type === "SPOT" ? "spot check" : "weekly count"})`,
          recordedById: session.id,
        },
      });
    }
  }

  await prisma.stockCount.update({
    where: { id: countId },
    data: { completedAt: new Date(), note: note || null },
  });

  revalidatePath("/manager/inventory");
  const tab = count.type === "SPOT" ? "spot-check" : "weekly";
  redirect(`/manager/inventory?tab=${tab}`);
}
