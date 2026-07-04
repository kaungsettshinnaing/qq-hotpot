"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAnyRole } from "@/lib/auth";
import { getSessionDetail } from "@/lib/orders";
import { getOpenShift, getAnyOpenShift, computeShiftTotals, getCashStanding } from "@/lib/shift";
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
  await requireAnyRole(CASHIER_ROLES);
  const id = str(formData.get("paymentId"));
  const p = await prisma.payment.findUnique({ where: { id }, include: { session: true } });
  if (!p || p.session.status !== "OPEN") return;
  await prisma.payment.delete({ where: { id } });
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

// --------------------------------------------------------------------------
// Expenses
// --------------------------------------------------------------------------

export async function addExpense(formData: FormData): Promise<void> {
  const user = await requireAnyRole(CASHIER_ROLES);
  const categoryId = str(formData.get("categoryId"));
  const paymentSource =
    str(formData.get("paymentSource")) === "BANK_TRANSFER" ? "BANK_TRANSFER" : "CASH_DRAWER";
  const invoiceType = str(formData.get("invoiceType")) === "STOCK" ? "STOCK" : "NON_STOCK";

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

  // Save attached receipt images
  const files = formData.getAll("receipts") as File[];
  if (files.length > 0) {
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
        data: { expenseId: expense.id, filePath: `receipts/${filename}` },
      });
    }
  }

  revalidatePath("/cashier/expenses");
  revalidatePath("/cashier/shift");
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
