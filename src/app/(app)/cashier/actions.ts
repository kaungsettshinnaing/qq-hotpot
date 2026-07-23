"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAnyRole } from "@/lib/auth";
import { getSessionDetail } from "@/lib/orders";
import { getOpenShift, getAnyOpenShift, computeShiftTotals, getCashStanding, createCashMovement } from "@/lib/shift";
import { runComparison } from "@/lib/deliveries";
import { emitFloor } from "@/lib/realtime";
import type { Role } from "@/lib/rbac";
import type { ActionResult } from "@/lib/action-result";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
const ALLOWED_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "heic", "pdf"]);

const CASHIER_ROLES: Role[] = ["CASHIER", "MANAGER", "ADMIN"];

function clampInt(v: unknown, min: number, max: number): number {
  const n = parseInt(String(v ?? ""), 10);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function str(v: unknown, max = 300): string {
  return String(v ?? "").trim().slice(0, max);
}

// --------------------------------------------------------------------------
// Discounts (cashier may apply freely)
// --------------------------------------------------------------------------

export async function applyDiscount(
  sessionId: string,
  type: "PERCENT" | "FIXED",
  value: number,
  reason: string,
): Promise<ActionResult> {
  await requireAnyRole(CASHIER_ROLES);
  const v = Math.max(0, Math.floor(value || 0));
  if (type === "PERCENT" && v > 100) return { ok: false, error: "Percent cannot exceed 100." };
  const s = await prisma.tableSession.findUnique({ where: { id: sessionId } });
  if (!s || s.status !== "OPEN") return { ok: false, error: "Bill is not open." };
  await prisma.tableSession.update({
    where: { id: sessionId },
    data: { discountType: type, discountValue: v, discountReason: reason.slice(0, 200) || null },
  });
  revalidatePath(`/cashier/checkout/${sessionId}`);
  return { ok: true };
}

export async function removeDiscount(sessionId: string): Promise<ActionResult> {
  await requireAnyRole(CASHIER_ROLES);
  await prisma.tableSession.update({
    where: { id: sessionId },
    data: { discountType: null, discountValue: null, discountReason: null },
  });
  revalidatePath(`/cashier/checkout/${sessionId}`);
  return { ok: true };
}

// --------------------------------------------------------------------------
// Payments (split allowed; only CASH affects the drawer)
// --------------------------------------------------------------------------

export async function addPayment(
  sessionId: string,
  method: "CASH" | "KBZPAY" | "OTHER",
  amount: number,
  reference: string,
): Promise<ActionResult> {
  const user = await requireAnyRole(CASHIER_ROLES);
  const amt = Math.floor(amount || 0);
  if (amt <= 0) return { ok: false, error: "Enter a positive amount." };
  const shift = await getOpenShift(user.id);
  if (!shift) return { ok: false, error: "Open a shift before taking payments." };
  const session = await prisma.tableSession.findUnique({ where: { id: sessionId } });
  if (!session || session.status !== "OPEN") return { ok: false, error: "Bill is not open." };

  await prisma.payment.create({
    data: {
      sessionId,
      method,
      amount: amt,
      reference: reference.trim().slice(0, 100) || null,
      receivedById: user.id,
      shiftId: shift.id,
    },
  });
  revalidatePath(`/cashier/checkout/${sessionId}`);
  return { ok: true };
}

export async function voidPayment(formData: FormData): Promise<void> {
  const user = await requireAnyRole(CASHIER_ROLES);
  const id = str(formData.get("paymentId"));
  const p = await prisma.payment.findUnique({ where: { id }, include: { session: true } });
  if (!p || p.session.status !== "OPEN" || p.voidedAt) return;
  // Soft-void, not delete — keeps an audit trail (who/when) and means a
  // session that ever had a payment still shows one to cancelSession's
  // financial-activity check, even after the payment is voided.
  await prisma.payment.update({
    where: { id },
    data: { voidedAt: new Date(), voidedById: user.id },
  });
  revalidatePath(`/cashier/checkout/${p.sessionId}`);
}

export async function settleSession(formData: FormData): Promise<void> {
  const user = await requireAnyRole(CASHIER_ROLES);
  const sessionId = str(formData.get("sessionId"));
  const note = str(formData.get("note"), 500) || null;
  const detail = await getSessionDetail(sessionId);
  if (!detail || detail.session.status !== "OPEN") redirect("/cashier");
  if (detail.balance > 0) redirect(`/cashier/checkout/${sessionId}`);

  await prisma.$transaction([
    prisma.tableMerge.deleteMany({ where: { sessionId } }),
    prisma.tableSession.update({
      where: { id: sessionId },
      data: { status: "CLOSED", closedById: user.id, closedAt: new Date(), billTotal: detail.bill.total, note },
    }),
  ]);
  emitFloor("table:update", { tableId: detail.session.tableId });
  revalidatePath("/cashier");
  revalidatePath("/waiter");
  redirect(`/cashier/checkout/${sessionId}?settled=1`);
}

// --------------------------------------------------------------------------
// Cashier shift / reconciliation
// --------------------------------------------------------------------------

export async function openShift(): Promise<void> {
  const user = await requireAnyRole(CASHIER_ROLES);
  // Redirect if this user already has a shift open
  const existing = await getOpenShift(user.id);
  if (existing) redirect("/cashier");
  // Block if ANY other cashier's shift is still open — cash must be handed over first
  const otherOpen = await getAnyOpenShift();
  if (otherOpen) redirect("/cashier?error=shift-blocked");
  const openingFloat = await getCashStanding();
  await prisma.cashierShift.create({ data: { cashierId: user.id, openingFloat } });
  revalidatePath("/cashier");
  revalidatePath("/cashier/shift");
  redirect("/cashier");
}

export async function closeShift(formData: FormData): Promise<void> {
  const user = await requireAnyRole(CASHIER_ROLES);
  const countedCash = clampInt(formData.get("countedCash"), 0, 1_000_000_000);
  const shift = await getOpenShift(user.id);
  if (!shift) redirect("/cashier/shift");
  const closedAt = new Date();
  const { expected } = await computeShiftTotals(shift.id, shift.openingFloat, { openedAt: shift.openedAt, closedAt });
  await prisma.cashierShift.update({
    where: { id: shift.id },
    data: {
      status: "CLOSED",
      closedAt,
      countedCash,
      expectedCash: expected,
      variance: countedCash - expected,
    },
  });
  revalidatePath("/cashier/shift");
  revalidatePath("/cashier");
  redirect("/cashier/shift");
}

/** Mid-shift cash inject/withdraw — auto-tagged to whichever shift is open
 *  (if any), so the drawer stays reconcilable against expected cash.
 *  Manager/admin only — a plain cashier moving cash out of their own drawer
 *  unsupervised would defeat the reconciliation this feature exists for. */
export async function recordCashMovement(formData: FormData): Promise<void> {
  const user = await requireAnyRole(["MANAGER", "ADMIN"]);
  const type = formData.get("type") as "COLLECT" | "INJECT";
  const amount = Math.round(Math.abs(Number(formData.get("amount")) || 0));
  const note = str(formData.get("note"), 300) || null;
  if (!amount || !["COLLECT", "INJECT"].includes(type)) return;
  await createCashMovement(type, amount, note, user.id);
  revalidatePath("/cashier");
  revalidatePath("/cashier/shift");
  revalidatePath("/cash-collection");
  revalidatePath("/reports");
}

// --------------------------------------------------------------------------
// Expenses
// --------------------------------------------------------------------------

export async function addExpense(formData: FormData): Promise<void> {
  const user = await requireAnyRole(CASHIER_ROLES);
  const categoryId = str(formData.get("categoryId"));
  const paymentSource =
    str(formData.get("paymentSource")) === "BANK_TRANSFER" ? "BANK_TRANSFER" : "CASH_DRAWER";
  // Stock invoices go through addStockInvoice (invoice = delivery); this
  // path only records non-stock expenses.
  const invoiceType = "NON_STOCK";

  // Line items
  const lineDescs  = formData.getAll("lineDesc").map(String);
  const lineUnits  = formData.getAll("lineUnit").map(String);
  const lineQtys   = formData.getAll("lineQty").map((v) => parseFloat(String(v)) || 1);
  const linePrices = formData.getAll("linePrice").map((v) => Math.max(0, parseInt(String(v)) || 0));

  const lines = lineDescs
    .map((desc, i) => ({
      description: desc.trim(),
      unit: lineUnits[i]?.trim() || null,
      qty: lineQtys[i],
      price: linePrices[i],
      sortOrder: i,
    }))
    .filter((l) => l.description && l.price > 0);

  if (!categoryId || lines.length === 0) {
    redirect("/cashier/expenses?error=missing");
  }

  const amount = lines.reduce((sum, l) => sum + l.price, 0);
  const description = lines.map((l) => l.description).join(", ").slice(0, 300);
  const businessDate = new Date();

  let shiftId: string | null = null;
  if (paymentSource === "CASH_DRAWER") {
    const userShift = await getOpenShift(user.id);
    shiftId = userShift?.id ?? (await getAnyOpenShift())?.id ?? null;
  }
  const expense = await prisma.expense.create({
    data: {
      categoryId,
      amount,
      paymentSource,
      description,
      invoiceType,
      businessDate,
      enteredById: user.id,
      shiftId,
      lines: { create: lines },
    },
  });

  await saveReceipts(expense.id, formData.getAll("receipts") as File[]);

  revalidatePath("/cashier/expenses");
  revalidatePath("/cashier/shift");
  redirect("/cashier/expenses");
}

async function saveReceipts(expenseId: string, files: File[]): Promise<void> {
  if (files.length === 0) return;
  const receiptsDir = path.join(UPLOAD_DIR, "receipts");
  mkdirSync(receiptsDir, { recursive: true });
  for (const file of files) {
    if (!(file instanceof File) || file.size === 0) continue;
    const rawExt = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const ext = ALLOWED_EXTS.has(rawExt) ? rawExt : "jpg";
    const filename = `${randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(path.join(receiptsDir, filename), buffer);
    await prisma.expenseAttachment.create({
      data: { expenseId, filePath: `receipts/${filename}` },
    });
  }
}

// --------------------------------------------------------------------------
// Stock invoice = delivery (invoice entry creates the delivery awaiting count)
// --------------------------------------------------------------------------

function posFloat(v: unknown): number {
  const n = parseFloat(String(v ?? ""));
  return Number.isNaN(n) || n < 0 ? 0 : n;
}
function posIntOf(v: unknown): number {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isNaN(n) || n < 0 ? 0 : n;
}

export async function addStockInvoice(formData: FormData): Promise<void> {
  const user = await requireAnyRole(CASHIER_ROLES);
  const categoryId = str(formData.get("categoryId"));
  const paymentSource =
    str(formData.get("paymentSource")) === "BANK_TRANSFER" ? "BANK_TRANSFER" : "CASH_DRAWER";
  const supplierId = str(formData.get("supplierId")) || null;
  const invoiceNo = str(formData.get("invoiceNo"), 100) || null;
  const taggedDeliveryId = str(formData.get("taggedDeliveryId")) || null;

  // Line rows (stock items only)
  const stockItemIds = formData.getAll("stockItemId").map(String);
  const lineUnits = formData.getAll("lineUnit").map(String);
  const lineQtys = formData.getAll("lineQty").map((v) => posFloat(v));
  const lineUnitCosts = formData.getAll("lineUnitCost").map((v) => posIntOf(v));

  const rows = stockItemIds
    .map((stockItemId, i) => ({
      stockItemId,
      unit: lineUnits[i]?.trim() || null,
      qty: lineQtys[i],
      unitCost: lineUnitCosts[i],
      lineTotal: Math.round(lineQtys[i] * lineUnitCosts[i]),
    }))
    .filter((r) => r.stockItemId && r.qty > 0);

  if (!categoryId || rows.length === 0) {
    redirect("/cashier/expenses?error=missing");
  }

  // Item names from DB (form only posts ids)
  const stockItems = await prisma.stockItem.findMany({
    where: { id: { in: rows.map((r) => r.stockItemId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(stockItems.map((s) => [s.id, s.name]));
  if (rows.some((r) => !nameById.has(r.stockItemId))) {
    redirect("/cashier/expenses?error=missing");
  }

  // Merge duplicate items for delivery rows (unique per delivery+stockItem)
  const merged = new Map<string, { qty: number; unitCost: number }>();
  for (const r of rows) {
    const prev = merged.get(r.stockItemId);
    merged.set(r.stockItemId, {
      qty: (prev?.qty ?? 0) + r.qty,
      unitCost: prev?.unitCost || r.unitCost,
    });
  }

  const total = rows.reduce((sum, r) => sum + r.lineTotal, 0);
  const description = rows.map((r) => nameById.get(r.stockItemId)).join(", ").slice(0, 300);
  const now = new Date();

  const supplier = supplierId
    ? await prisma.supplier.findUnique({ where: { id: supplierId }, select: { name: true } })
    : null;

  if (taggedDeliveryId) {
    // Invoice for an existing outstanding delivery (prepaid or next batch)
    const tagged = await prisma.stockDelivery.findUnique({ where: { id: taggedDeliveryId } });
    if (!tagged) redirect("/cashier/expenses?error=bad_delivery");

    if (tagged.status === "PREPAID") {
      // Payment was already captured at prepay time — fill the delivery, no new expense
      const counterAlreadySubmitted = !!tagged.counterSubmittedAt;
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.stockDelivery.updateMany({
          where: { id: taggedDeliveryId, status: "PREPAID", cashierSubmittedAt: null },
          data: {
            status: "OPEN",
            cashierEnteredById: user.id,
            cashierSubmittedAt: now,
            ...(supplierId ? { supplierId } : {}),
            ...(invoiceNo ? { invoiceNo } : {}),
          },
        });
        if (claimed.count !== 1) throw new Error("already_submitted");

        for (const [stockItemId, m] of merged) {
          await tx.stockDeliveryItem.upsert({
            where: { deliveryId_stockItemId: { deliveryId: taggedDeliveryId, stockItemId } },
            update: { cashierQty: Math.round(m.qty), unitCost: m.unitCost || null },
            create: {
              deliveryId: taggedDeliveryId,
              stockItemId,
              cashierQty: Math.round(m.qty),
              unitCost: m.unitCost || null,
            },
          });
        }
        await tx.stockDeliveryLog.create({
          data: { deliveryId: taggedDeliveryId, actorId: user.id, action: "CASHIER_SUBMITTED",
            note: `Invoice for prepaid order: ${rows.length} item(s), ${total.toLocaleString()} MMK` },
        });
        if (tagged.totalCost != null && tagged.totalCost !== total) {
          await tx.stockDeliveryLog.create({
            data: { deliveryId: taggedDeliveryId, actorId: user.id, action: "PREPAY_MISMATCH",
              note: `Prepaid ${tagged.totalCost.toLocaleString()} MMK vs invoice ${total.toLocaleString()} MMK — admin settlement required` },
          });
        }
      }).catch(() => redirect(`/cashier/expenses?error=already_submitted`));

      // Legacy prepaid deliveries may already have a count (count-first era)
      if (counterAlreadySubmitted) {
        await runComparison(taggedDeliveryId, user.id);
      }

      revalidatePath("/cashier/expenses");
      revalidatePath("/inventory");
      revalidatePath("/inventory/deliveries");
      revalidatePath("/manager/inventory");
      redirect("/cashier/expenses");
    }

    if (tagged.status !== "PARTIAL") redirect("/cashier/expenses?error=bad_delivery");
    // Next batch of a partial delivery — falls through to creation below,
    // linked via parentDeliveryId. The parent being PREPAID means the whole
    // order was paid up front, so no new expense for the batch either.
    const parentPrepaid = tagged.paymentStatus === "PREPAID";
    await createInvoiceDelivery({
      userId: user.id, categoryId, paymentSource, supplierId: supplierId ?? tagged.supplierId,
      invoiceNo, rows, merged, total, description, now,
      vendor: supplier?.name ?? null,
      parentDeliveryId: taggedDeliveryId,
      skipExpense: parentPrepaid,
      receipts: formData.getAll("receipts") as File[],
    });
  } else {
    await createInvoiceDelivery({
      userId: user.id, categoryId, paymentSource, supplierId, invoiceNo,
      rows, merged, total, description, now,
      vendor: supplier?.name ?? null,
      parentDeliveryId: null,
      skipExpense: false,
      receipts: formData.getAll("receipts") as File[],
    });
  }

  revalidatePath("/cashier/expenses");
  revalidatePath("/cashier/shift");
  revalidatePath("/inventory");
  revalidatePath("/inventory/deliveries");
  revalidatePath("/manager/inventory");
  redirect("/cashier/expenses");
}

async function createInvoiceDelivery(args: {
  userId: string;
  categoryId: string;
  paymentSource: "CASH_DRAWER" | "BANK_TRANSFER";
  supplierId: string | null;
  invoiceNo: string | null;
  rows: { stockItemId: string; unit: string | null; qty: number; unitCost: number; lineTotal: number }[];
  merged: Map<string, { qty: number; unitCost: number }>;
  total: number;
  description: string;
  now: Date;
  vendor: string | null;
  parentDeliveryId: string | null;
  skipExpense: boolean;
  receipts: File[];
}): Promise<void> {
  const { userId, categoryId, paymentSource, supplierId, invoiceNo, rows, merged,
    total, description, now, vendor, parentDeliveryId, skipExpense, receipts } = args;

  let shiftId: string | null = null;
  if (!skipExpense && paymentSource === "CASH_DRAWER") {
    const userShift = await getOpenShift(userId);
    shiftId = userShift?.id ?? (await getAnyOpenShift())?.id ?? null;
  }

  // Item names for the expense lines
  const stockItems = await prisma.stockItem.findMany({
    where: { id: { in: rows.map((r) => r.stockItemId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(stockItems.map((s) => [s.id, s.name]));

  const expenseId = await prisma.$transaction(async (tx) => {
    let createdExpenseId: string | null = null;
    if (!skipExpense) {
      const expense = await tx.expense.create({
        data: {
          businessDate: now,
          categoryId,
          amount: total,
          paymentSource,
          description,
          vendor,
          invoiceType: "STOCK",
          shiftId,
          enteredById: userId,
          lines: {
            create: rows.map((r, i) => ({
              description: nameById.get(r.stockItemId) ?? "—",
              unit: r.unit,
              qty: r.qty,
              price: r.lineTotal,
              sortOrder: i,
            })),
          },
        },
      });
      createdExpenseId = expense.id;
    }

    const delivery = await tx.stockDelivery.create({
      data: {
        deliveryDate: now,
        invoiceNo,
        supplierId,
        parentDeliveryId,
        invoiceType: "STOCK",
        status: "OPEN",
        paymentStatus: skipExpense ? "PREPAID" : "PAID",
        paymentSource,
        totalCost: total,
        expenseId: createdExpenseId,
        createdById: userId,
        cashierEnteredById: userId,
        cashierSubmittedAt: now,
        items: {
          create: [...merged].map(([stockItemId, m]) => ({
            stockItemId,
            cashierQty: Math.round(m.qty),
            unitCost: m.unitCost || null,
          })),
        },
      },
    });
    await tx.stockDeliveryLog.create({
      data: { deliveryId: delivery.id, actorId: userId, action: "CREATED",
        note: "Stock invoice entered at cashier expenses" },
    });
    await tx.stockDeliveryLog.create({
      data: { deliveryId: delivery.id, actorId: userId, action: "CASHIER_SUBMITTED",
        note: `${merged.size} item(s), ${total.toLocaleString()} MMK` },
    });
    return createdExpenseId;
  });

  if (expenseId) await saveReceipts(expenseId, receipts);
}

export async function recordStockPrepayment(formData: FormData): Promise<void> {
  const user = await requireAnyRole(CASHIER_ROLES);
  const categoryId = str(formData.get("categoryId"));
  const paymentSource =
    str(formData.get("paymentSource")) === "BANK_TRANSFER" ? "BANK_TRANSFER" : "CASH_DRAWER";
  const supplierId = str(formData.get("supplierId")) || null;
  const amount = posIntOf(formData.get("amount"));
  const description = str(formData.get("description"), 300) || "Stock pre-payment";

  if (!categoryId || amount <= 0) redirect("/cashier/expenses?error=missing");

  let shiftId: string | null = null;
  if (paymentSource === "CASH_DRAWER") {
    const userShift = await getOpenShift(user.id);
    shiftId = userShift?.id ?? (await getAnyOpenShift())?.id ?? null;
  }

  const supplier = supplierId
    ? await prisma.supplier.findUnique({ where: { id: supplierId }, select: { name: true } })
    : null;
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        businessDate: now,
        categoryId,
        amount,
        paymentSource,
        description,
        vendor: supplier?.name ?? null,
        invoiceType: "STOCK",
        shiftId,
        enteredById: user.id,
      },
    });
    const delivery = await tx.stockDelivery.create({
      data: {
        deliveryDate: now,
        supplierId,
        invoiceType: "STOCK",
        status: "PREPAID",
        paymentStatus: "PREPAID",
        paymentSource,
        totalCost: amount,
        expenseId: expense.id,
        prepaidAt: now,
        createdById: user.id,
        cashierEnteredById: user.id,
      },
    });
    await tx.stockDeliveryLog.create({
      data: { deliveryId: delivery.id, actorId: user.id, action: "CREATED",
        note: "Pre-payment recorded at cashier expenses" },
    });
    await tx.stockDeliveryLog.create({
      data: { deliveryId: delivery.id, actorId: user.id, action: "PREPAID",
        note: `${amount.toLocaleString()} MMK via ${paymentSource}` },
    });
  });

  revalidatePath("/cashier/expenses");
  revalidatePath("/cashier/shift");
  revalidatePath("/inventory/deliveries");
  revalidatePath("/manager/inventory");
  redirect("/cashier/expenses");
}

// --------------------------------------------------------------------------
// Reservations
// --------------------------------------------------------------------------

export async function createReservation(formData: FormData): Promise<void> {
  const user = await requireAnyRole(CASHIER_ROLES);
  const customerName = str(formData.get("customerName"), 200);
  const phone = str(formData.get("phone"), 50) || null;
  const partySize = clampInt(formData.get("partySize"), 1, 9999);
  const tableId = str(formData.get("tableId")) || null;
  const bookingStr = str(formData.get("bookingAt"), 40);
  const durationMin = clampInt(formData.get("durationMin"), 30, 1440);
  const note = str(formData.get("note")) || null;

  if (!customerName || !bookingStr) redirect("/cashier/tables?error=missing");
  await prisma.reservation.create({
    data: {
      customerName,
      phone,
      partySize,
      tableId,
      bookingAt: new Date(bookingStr),
      durationMin,
      note,
      createdById: user.id,
    },
  });
  emitFloor("table:update", {});
  revalidatePath("/cashier/tables");
  revalidatePath("/waiter");
  redirect("/cashier/tables");
}

export async function cancelReservation(formData: FormData): Promise<void> {
  await requireAnyRole(CASHIER_ROLES);
  const id = str(formData.get("reservationId"));
  await prisma.reservation.updateMany({
    where: { id, status: "BOOKED" },
    data: { status: "CANCELLED" },
  });
  emitFloor("table:update", {});
  revalidatePath("/cashier/tables");
  revalidatePath("/waiter");
}

export async function noShowReservation(formData: FormData): Promise<void> {
  await requireAnyRole(CASHIER_ROLES);
  const id = str(formData.get("reservationId"));
  await prisma.reservation.updateMany({
    where: { id, status: "BOOKED" },
    data: { status: "NO_SHOW" },
  });
  emitFloor("table:update", {});
  revalidatePath("/cashier/tables");
  revalidatePath("/waiter");
}

export async function seatReservation(formData: FormData): Promise<void> {
  const user = await requireAnyRole(CASHIER_ROLES);
  const id = str(formData.get("reservationId"));
  const res = await prisma.reservation.findUnique({ where: { id } });
  if (!res || res.status !== "BOOKED") redirect("/cashier/tables");

  await prisma.reservation.update({ where: { id }, data: { status: "SEATED" } });

  if (res.tableId) {
    const open = await prisma.tableSession.findFirst({
      where: { tableId: res.tableId, status: "OPEN" },
    });
    if (!open) {
      const session = await prisma.tableSession.create({
        data: { tableId: res.tableId, adults: res.partySize, children: 0, openedById: user.id },
      });
      emitFloor("table:update", { tableId: res.tableId });
      revalidatePath("/cashier/tables");
      revalidatePath("/waiter");
      redirect(`/waiter/session/${session.id}`);
    }
  }
  emitFloor("table:update", {});
  revalidatePath("/cashier/tables");
  redirect("/cashier/tables");
}
