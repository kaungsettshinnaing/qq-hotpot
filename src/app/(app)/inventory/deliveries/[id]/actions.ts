"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ExpenseSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAnyRole, requireSession } from "@/lib/auth";

function str(v: unknown, max = 200): string {
  return String(v ?? "").trim().slice(0, max);
}
function optInt(v: unknown): number | null {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isNaN(n) ? null : n;
}
function posInt(v: unknown): number {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isNaN(n) || n < 0 ? 0 : n;
}

// ---- Create delivery header (either party) ----

export async function createDelivery(formData: FormData): Promise<void> {
  const session = await requireSession();
  const supplierId = str(formData.get("supplierId")) || null;
  const deliveryDate = new Date(str(formData.get("deliveryDate")) || Date.now());
  const invoiceNo = str(formData.get("invoiceNo"), 100) || null;
  const parentId = str(formData.get("parentId")) || null;

  const delivery = await prisma.stockDelivery.create({
    data: {
      deliveryDate,
      invoiceNo,
      supplierId,
      parentDeliveryId: parentId,
      createdById: session.id,
    },
  });
  await prisma.stockDeliveryLog.create({
    data: { deliveryId: delivery.id, actorId: session.id, action: "CREATED" },
  });
  redirect(`/inventory/deliveries/${delivery.id}`);
}

// ---- Record pre-payment (cashier/admin) ----

export async function recordPrepayment(formData: FormData): Promise<void> {
  const session = await requireSession();
  await requireAnyRole(["CASHIER", "MANAGER", "ADMIN"]);
  const id = str(formData.get("id"));
  const paymentSourceRaw = str(formData.get("paymentSource")) as ExpenseSource;
  const paymentSource: ExpenseSource = paymentSourceRaw === "BANK_TRANSFER" ? "BANK_TRANSFER" : "CASH_DRAWER";
  const totalCost = posInt(formData.get("totalCost"));
  const categoryId = str(formData.get("categoryId"));
  const description = str(formData.get("description"), 300) || "Stock pre-payment";

  const delivery = await prisma.stockDelivery.findUniqueOrThrow({ where: { id } });
  if (delivery.paymentStatus !== "UNPAID") redirect(`/inventory/deliveries/${id}?error=already_paid`);

  // Create expense record
  const expense = await prisma.expense.create({
    data: {
      businessDate: new Date(),
      categoryId,
      amount: totalCost,
      paymentSource,
      description,
      vendor: delivery.supplierId ? undefined : undefined,
      enteredById: session.id,
      ...(paymentSource === "CASH_DRAWER"
        ? {}
        : {}),
    },
  });

  await prisma.stockDelivery.update({
    where: { id },
    data: {
      paymentStatus: "PREPAID",
      status: "PREPAID",
      totalCost,
      paymentSource,
      expenseId: expense.id,
      prepaidAt: new Date(),
      cashierEnteredById: session.id,
    },
  });
  await prisma.stockDeliveryLog.create({
    data: { deliveryId: id, actorId: session.id, action: "PREPAID",
      note: `${totalCost.toLocaleString()} MMK via ${paymentSource}` },
  });
  revalidatePath(`/inventory/deliveries/${id}`);
  redirect(`/inventory/deliveries/${id}`);
}

// ---- Submit cashier side (invoice quantities + cost) ----

export async function submitCashierSide(formData: FormData): Promise<void> {
  const session = await requireSession();
  await requireAnyRole(["CASHIER", "MANAGER", "ADMIN"]);
  const id = str(formData.get("deliveryId"));
  const paymentSourceRaw = str(formData.get("paymentSource")) as ExpenseSource;
  const paymentSource: ExpenseSource = paymentSourceRaw === "BANK_TRANSFER" ? "BANK_TRANSFER" : "CASH_DRAWER";
  const categoryId = str(formData.get("categoryId"));
  const description = str(formData.get("description"), 300) || "Stock delivery";

  const delivery = await prisma.stockDelivery.findUniqueOrThrow({
    where: { id },
    include: { items: true },
  });
  if (delivery.cashierSubmittedAt) redirect(`/inventory/deliveries/${id}?error=already_submitted`);

  // Parse item entries from form: itemId[] + cashierQty[] + orderedQty[] + unitCost[]
  const itemIds = formData.getAll("itemId").map(String);
  const cashierQtys = formData.getAll("cashierQty").map((v) => posInt(v));
  const orderedQtys = formData.getAll("orderedQty").map((v) => optInt(v));
  const unitCosts = formData.getAll("unitCost").map((v) => optInt(v));

  const filteredItems = itemIds
    .map((itemId, i) => ({ itemId, cashierQty: cashierQtys[i], orderedQty: orderedQtys[i], unitCost: unitCosts[i] }))
    .filter((x) => x.cashierQty > 0 || x.orderedQty != null);

  if (filteredItems.length === 0) redirect(`/inventory/deliveries/${id}?error=no_items`);

  // Upsert delivery items
  for (const item of filteredItems) {
    await prisma.stockDeliveryItem.upsert({
      where: { deliveryId_stockItemId: { deliveryId: id, stockItemId: item.itemId } },
      update: { cashierQty: item.cashierQty, orderedQty: item.orderedQty, unitCost: item.unitCost },
      create: {
        deliveryId: id,
        stockItemId: item.itemId,
        cashierQty: item.cashierQty,
        orderedQty: item.orderedQty,
        unitCost: item.unitCost,
      },
    });
  }

  const totalCost = filteredItems.reduce((sum, x) => {
    return sum + ((x.orderedQty ?? x.cashierQty) * (x.unitCost ?? 0));
  }, 0);

  // Create expense if not already pre-paid
  let expenseId = delivery.expenseId;
  if (!expenseId && categoryId) {
    const expense = await prisma.expense.create({
      data: {
        businessDate: delivery.deliveryDate,
        categoryId,
        amount: totalCost,
        paymentSource,
        description,
        enteredById: session.id,
      },
    });
    expenseId = expense.id;
  }

  const newStatus = delivery.counterSubmittedAt ? null : "OPEN";

  await prisma.stockDelivery.update({
    where: { id },
    data: {
      cashierEnteredById: session.id,
      cashierSubmittedAt: new Date(),
      totalCost,
      paymentStatus: "PAID",
      paymentSource,
      expenseId,
      ...(newStatus ? { status: newStatus } : {}),
    },
  });
  await prisma.stockDeliveryLog.create({
    data: { deliveryId: id, actorId: session.id, action: "CASHIER_SUBMITTED",
      note: `${filteredItems.length} items, ${totalCost.toLocaleString()} MMK` },
  });

  // If counter already submitted, run comparison
  if (delivery.counterSubmittedAt) {
    await runComparison(id, session.id);
  }
  revalidatePath(`/inventory/deliveries/${id}`);
  redirect(`/inventory/deliveries/${id}`);
}

// ---- Submit counter side (physical count) ----

export async function submitCounterSide(formData: FormData): Promise<void> {
  const session = await requireSession();
  await requireAnyRole(["WAITER", "KITCHEN", "MANAGER", "ADMIN"]);
  const id = str(formData.get("deliveryId"));

  const delivery = await prisma.stockDelivery.findUniqueOrThrow({
    where: { id },
    include: { items: true },
  });
  if (delivery.counterSubmittedAt) redirect(`/inventory/deliveries/${id}?error=already_counted`);

  const itemIds = formData.getAll("itemId").map(String);
  const counterQtys = formData.getAll("counterQty").map((v) => posInt(v));

  const entries = itemIds.map((itemId, i) => ({ itemId, counterQty: counterQtys[i] }));

  for (const entry of entries) {
    await prisma.stockDeliveryItem.upsert({
      where: { deliveryId_stockItemId: { deliveryId: id, stockItemId: entry.itemId } },
      update: { counterQty: entry.counterQty },
      create: { deliveryId: id, stockItemId: entry.itemId, counterQty: entry.counterQty },
    });
  }

  const newStatus = delivery.cashierSubmittedAt ? null : "OPEN";

  await prisma.stockDelivery.update({
    where: { id },
    data: {
      counterEnteredById: session.id,
      counterSubmittedAt: new Date(),
      ...(newStatus ? { status: newStatus } : {}),
    },
  });
  await prisma.stockDeliveryLog.create({
    data: { deliveryId: id, actorId: session.id, action: "COUNTER_SUBMITTED",
      note: `${entries.length} items counted` },
  });

  // If cashier already submitted, run comparison
  if (delivery.cashierSubmittedAt) {
    await runComparison(id, session.id);
  }
  revalidatePath(`/inventory/deliveries/${id}`);
  redirect(`/inventory/deliveries/${id}`);
}

// ---- Internal: compare both sides ----

async function runComparison(deliveryId: string, actorId: string) {
  const items = await prisma.stockDeliveryItem.findMany({ where: { deliveryId } });
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
    // Auto-complete: all match
    for (const item of items) {
      if (item.cashierQty != null) {
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
  }
}

// ---- Manager: resolve discrepancy ----

export async function resolveDelivery(formData: FormData): Promise<void> {
  const session = await requireSession();
  await requireAnyRole(["MANAGER", "ADMIN"]);
  const id = str(formData.get("deliveryId"));
  const resolutionNote = str(formData.get("resolutionNote"), 500);
  const isPartial = formData.get("isPartial") === "on";

  const items = await prisma.stockDeliveryItem.findMany({ where: { deliveryId: id } });

  for (const item of items) {
    const finalQtyRaw = formData.get(`final_${item.id}`);
    const finalQty = posInt(finalQtyRaw ?? item.cashierQty ?? item.counterQty ?? 0);
    await prisma.stockDeliveryItem.update({
      where: { id: item.id },
      data: { finalQty },
    });
    await prisma.stockMovement.create({
      data: {
        stockItemId: item.stockItemId,
        type: "DELIVERY_IN",
        qty: finalQty,
        deliveryId: id,
        recordedById: session.id,
      },
    });
  }

  const newStatus = isPartial ? "PARTIAL" : "COMPLETE";
  await prisma.stockDelivery.update({
    where: { id },
    data: {
      status: newStatus,
      resolvedById: session.id,
      resolvedAt: new Date(),
      resolutionNote,
    },
  });
  await prisma.stockDeliveryLog.create({
    data: { deliveryId: id, actorId: session.id,
      action: isPartial ? "MARKED_PARTIAL" : "MANAGER_RESOLVED",
      note: resolutionNote || undefined },
  });
  revalidatePath(`/inventory/deliveries/${id}`);
  revalidatePath("/manager/inventory");
  redirect(`/inventory/deliveries/${id}`);
}
