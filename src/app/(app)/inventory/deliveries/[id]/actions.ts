"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ExpenseSource, InvoiceType } from "@prisma/client";
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
function posFloat(v: unknown): number {
  const n = parseFloat(String(v ?? ""));
  return Number.isNaN(n) || n < 0 ? 0 : n;
}

// ---- Create delivery header (either party) ----

export async function createDelivery(formData: FormData): Promise<void> {
  const session = await requireSession();
  const supplierId = str(formData.get("supplierId")) || null;
  const deliveryDate = new Date(str(formData.get("deliveryDate")) || Date.now());
  const invoiceNo = str(formData.get("invoiceNo"), 100) || null;
  const parentId = str(formData.get("parentId")) || null;
  const invoiceTypeRaw = str(formData.get("invoiceType"));
  const invoiceType: InvoiceType = invoiceTypeRaw === "NON_STOCK" ? "NON_STOCK" : "STOCK";

  const delivery = await prisma.stockDelivery.create({
    data: {
      deliveryDate,
      invoiceNo,
      supplierId,
      parentDeliveryId: parentId,
      invoiceType,
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

  const expense = await prisma.expense.create({
    data: {
      businessDate: new Date(),
      categoryId,
      amount: totalCost,
      paymentSource,
      description,
      enteredById: session.id,
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

// ---- Submit cashier side — STOCK invoice (invoice quantities + cost) ----

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

  const itemIds = formData.getAll("itemId").map(String);
  const cashierQtys = formData.getAll("cashierQty").map((v) => posInt(v));
  const orderedQtys = formData.getAll("orderedQty").map((v) => optInt(v));
  const unitCosts = formData.getAll("unitCost").map((v) => optInt(v));

  const filteredItems = itemIds
    .map((itemId, i) => ({ itemId, cashierQty: cashierQtys[i], orderedQty: orderedQtys[i], unitCost: unitCosts[i] }))
    .filter((x) => x.cashierQty > 0 || x.orderedQty != null);

  if (filteredItems.length === 0) redirect(`/inventory/deliveries/${id}?error=no_items`);

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

  if (delivery.counterSubmittedAt) {
    await runComparison(id, session.id);
  }
  revalidatePath(`/inventory/deliveries/${id}`);
  redirect(`/inventory/deliveries/${id}`);
}

// ---- Submit cashier side — NON_STOCK invoice (free-text lines, auto-completes) ----

export async function submitNonStockCashierSide(formData: FormData): Promise<void> {
  const session = await requireSession();
  await requireAnyRole(["CASHIER", "MANAGER", "ADMIN"]);
  const id = str(formData.get("deliveryId"));
  const paymentSourceRaw = str(formData.get("paymentSource")) as ExpenseSource;
  const paymentSource: ExpenseSource = paymentSourceRaw === "BANK_TRANSFER" ? "BANK_TRANSFER" : "CASH_DRAWER";
  const categoryId = str(formData.get("categoryId"));
  const description = str(formData.get("description"), 300) || "Non-stock delivery";

  const delivery = await prisma.stockDelivery.findUniqueOrThrow({ where: { id } });
  if (delivery.cashierSubmittedAt) redirect(`/inventory/deliveries/${id}?error=already_submitted`);

  const descs     = formData.getAll("lineDesc").map(String);
  const qtys      = formData.getAll("lineQty").map((v) => posFloat(v));
  const units     = formData.getAll("lineUnit").map(String);
  const unitCosts = formData.getAll("lineUnitCost").map((v) => posInt(v));

  const lines = descs
    .map((desc, i) => ({ description: desc.trim(), qty: qtys[i], unitLabel: units[i].trim(), unitCost: unitCosts[i] }))
    .filter((l) => l.description);

  if (lines.length === 0) redirect(`/inventory/deliveries/${id}?error=no_items`);

  // Create line items (non-stock = stockItemId null)
  for (const line of lines) {
    await prisma.stockDeliveryItem.create({
      data: {
        deliveryId: id,
        stockItemId: null,
        description: line.description,
        unitLabel: line.unitLabel || null,
        cashierQty: Math.round(line.qty),
        finalQty: Math.round(line.qty),
        unitCost: line.unitCost || null,
      },
    });
  }

  const totalCost = lines.reduce((sum, l) => sum + l.qty * (l.unitCost ?? 0), 0);

  let expenseId = delivery.expenseId;
  if (!expenseId && categoryId) {
    const expense = await prisma.expense.create({
      data: {
        businessDate: delivery.deliveryDate,
        categoryId,
        amount: Math.round(totalCost),
        paymentSource,
        description,
        enteredById: session.id,
      },
    });
    expenseId = expense.id;
  }

  // Non-stock: auto-complete immediately, no counter step
  await prisma.stockDelivery.update({
    where: { id },
    data: {
      cashierEnteredById: session.id,
      cashierSubmittedAt: new Date(),
      totalCost: Math.round(totalCost),
      paymentStatus: "PAID",
      paymentSource,
      expenseId,
      status: "COMPLETE",
    },
  });
  await prisma.stockDeliveryLog.create({
    data: { deliveryId: id, actorId: session.id, action: "AUTO_COMPLETED",
      note: `Non-stock: ${lines.length} line(s), ${Math.round(totalCost).toLocaleString()} MMK` },
  });
  revalidatePath(`/inventory/deliveries/${id}`);
  redirect(`/inventory/deliveries/${id}`);
}

// ---- Submit counter side (physical count — STOCK only) ----

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

  if (delivery.cashierSubmittedAt) {
    await runComparison(id, session.id);
  }
  revalidatePath(`/inventory/deliveries/${id}`);
  redirect(`/inventory/deliveries/${id}`);
}

// ---- Internal: compare both sides (STOCK items only) ----

async function runComparison(deliveryId: string, actorId: string) {
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
  }
}

// ---- Manager: resolve discrepancy (STOCK only) ----

export async function resolveDelivery(formData: FormData): Promise<void> {
  const session = await requireSession();
  await requireAnyRole(["MANAGER", "ADMIN"]);
  const id = str(formData.get("deliveryId"));
  const resolutionNote = str(formData.get("resolutionNote"), 500);
  const isPartial = formData.get("isPartial") === "on";

  // Only resolve stock items (non-stock lines have no counter side)
  const items = await prisma.stockDeliveryItem.findMany({
    where: { deliveryId: id, stockItemId: { not: null } },
  });

  for (const item of items) {
    const finalQtyRaw = formData.get(`final_${item.id}`);
    const finalQty = posInt(finalQtyRaw ?? item.cashierQty ?? item.counterQty ?? 0);
    await prisma.stockDeliveryItem.update({
      where: { id: item.id },
      data: { finalQty },
    });
    if (item.stockItemId) {
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
