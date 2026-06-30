"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAnyRole } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { freePotsAllowed } from "@/lib/pricing";
import { emitKitchen, emitFloor } from "@/lib/realtime";
import type { Role } from "@/lib/rbac";
import type { ActionResult } from "@/lib/action-result";

const WAITER_ROLES: Role[] = ["WAITER", "MANAGER", "ADMIN"];

function clampInt(v: unknown, min: number, max: number): number {
  const n = parseInt(String(v ?? ""), 10);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export async function openTable(tableId: string, formData: FormData): Promise<void> {
  const user = await requireAnyRole(WAITER_ROLES);
  const adults = clampInt(formData.get("adults"), 0, 999);
  const children = clampInt(formData.get("children"), 0, 999);

  const existing = await prisma.tableSession.findFirst({
    where: { tableId, status: "OPEN" },
  });
  if (existing) redirect(`/waiter/session/${existing.id}`);

  const session = await prisma.tableSession.create({
    data: { tableId, adults, children, openedById: user.id },
  });
  emitFloor("table:update", { tableId });
  revalidatePath("/waiter");
  redirect(`/waiter/session/${session.id}`);
}

export async function updateHeadcount(
  sessionId: string,
  adults: number,
  children: number,
): Promise<ActionResult> {
  await requireAnyRole(WAITER_ROLES);
  if (adults < 0 || children < 0) return { ok: false, error: "Invalid count." };
  const s = await prisma.tableSession.findUnique({ where: { id: sessionId } });
  if (!s || s.status !== "OPEN") return { ok: false, error: "Session is not open." };
  await prisma.tableSession.update({
    where: { id: sessionId },
    data: { adults: Math.floor(adults), children: Math.floor(children) },
  });
  emitFloor("table:update", { tableId: s.tableId });
  revalidatePath(`/waiter/session/${sessionId}`);
  return { ok: true };
}

export async function addPot(
  sessionId: string,
  kind: "HOTPOT" | "BBQ",
  flavourIds: string[],
): Promise<ActionResult> {
  const user = await requireAnyRole(WAITER_ROLES);
  const session = await prisma.tableSession.findUnique({
    where: { id: sessionId },
    include: { potOrders: { where: { voidedAt: null } } },
  });
  if (!session || session.status !== "OPEN") return { ok: false, error: "Session is not open." };

  const need = kind === "HOTPOT" ? 2 : 1;
  const ids = (flavourIds || []).filter(Boolean).slice(0, need);
  if (ids.length !== need) {
    return { ok: false, error: `Choose ${need} soup flavour${need > 1 ? "s" : ""}.` };
  }
  const distinct = [...new Set(ids)];
  const found = await prisma.soupFlavour.findMany({
    where: { id: { in: distinct }, isActive: true },
    select: { id: true },
  });
  if (found.length !== distinct.length) return { ok: false, error: "Invalid soup flavour." };

  const settings = await getSettings();
  const diners = session.adults + session.children;
  const allowance = freePotsAllowed(diners, settings.freePotRatio, settings.freePotRounding);
  const isFree = session.potOrders.length < allowance;

  await prisma.potOrder.create({
    data: {
      sessionId,
      kind,
      isFree,
      createdById: user.id,
      flavours: { create: ids.map((flavourId) => ({ flavourId })) },
    },
  });

  emitKitchen("pot:new", { sessionId, tableId: session.tableId });
  emitFloor("table:update", { tableId: session.tableId });
  revalidatePath(`/waiter/session/${sessionId}`);
  revalidatePath("/kitchen");
  return { ok: true };
}

export async function voidPot(formData: FormData): Promise<void> {
  await requireAnyRole(WAITER_ROLES);
  const potId = String(formData.get("potId") ?? "");
  const pot = await prisma.potOrder.findUnique({
    where: { id: potId },
    include: { session: true },
  });
  if (!pot || pot.voidedAt || pot.status === "DELIVERED") return;
  await prisma.potOrder.update({ where: { id: potId }, data: { voidedAt: new Date() } });
  emitKitchen("pot:void", { potId });
  emitFloor("table:update", { tableId: pot.session.tableId });
  revalidatePath(`/waiter/session/${pot.sessionId}`);
  revalidatePath("/kitchen");
}

export async function setBeerQty(sessionId: string, qty: number): Promise<ActionResult> {
  const user = await requireAnyRole(WAITER_ROLES);
  const q = Math.max(0, Math.min(999, Math.floor(qty || 0)));
  const session = await prisma.tableSession.findUnique({
    where: { id: sessionId },
    include: { orderItems: { where: { itemCode: "BEER", voidedAt: null } } },
  });
  if (!session || session.status !== "OPEN") return { ok: false, error: "Session is not open." };
  const price = (await prisma.menuItem.findUnique({ where: { code: "BEER" } }))?.price ?? 0;

  const [first, ...rest] = session.orderItems;
  if (rest.length) {
    await prisma.orderItem.updateMany({
      where: { id: { in: rest.map((r) => r.id) } },
      data: { voidedAt: new Date() },
    });
  }
  if (q === 0) {
    if (first) await prisma.orderItem.update({ where: { id: first.id }, data: { voidedAt: new Date() } });
  } else if (first) {
    await prisma.orderItem.update({ where: { id: first.id }, data: { qty: q, unitPrice: price } });
  } else {
    await prisma.orderItem.create({
      data: { sessionId, itemCode: "BEER", qty: q, unitPrice: price, createdById: user.id },
    });
  }
  emitFloor("table:update", { tableId: session.tableId });
  revalidatePath(`/waiter/session/${sessionId}`);
  return { ok: true };
}

export async function setItemQty(
  sessionId: string,
  itemCode: string,
  qty: number,
): Promise<ActionResult> {
  const user = await requireAnyRole(WAITER_ROLES);
  const q = Math.max(0, Math.min(999, Math.floor(qty || 0)));
  const session = await prisma.tableSession.findUnique({
    where: { id: sessionId },
    include: { orderItems: { where: { itemCode, voidedAt: null } } },
  });
  if (!session || session.status !== "OPEN") return { ok: false, error: "Session is not open." };
  const unitPrice = (await prisma.menuItem.findUnique({ where: { code: itemCode } }))?.price ?? 0;
  const [first, ...rest] = session.orderItems;
  if (rest.length) {
    await prisma.orderItem.updateMany({
      where: { id: { in: rest.map((r) => r.id) } },
      data: { voidedAt: new Date() },
    });
  }
  if (q === 0) {
    if (first) await prisma.orderItem.update({ where: { id: first.id }, data: { voidedAt: new Date() } });
  } else if (first) {
    await prisma.orderItem.update({ where: { id: first.id }, data: { qty: q, unitPrice } });
  } else {
    await prisma.orderItem.create({
      data: { sessionId, itemCode, qty: q, unitPrice, createdById: user.id },
    });
  }
  emitFloor("table:update", { tableId: session.tableId });
  revalidatePath(`/waiter/session/${sessionId}`);
  return { ok: true };
}

export async function setWastage(sessionId: string, grams: number): Promise<ActionResult> {
  await requireAnyRole(WAITER_ROLES);
  const g = Math.max(0, Math.min(1_000_000, Math.floor(grams || 0)));
  const s = await prisma.tableSession.findUnique({ where: { id: sessionId } });
  if (!s || s.status !== "OPEN") return { ok: false, error: "Session is not open." };
  await prisma.tableSession.update({ where: { id: sessionId }, data: { wastageGrams: g } });
  revalidatePath(`/waiter/session/${sessionId}`);
  return { ok: true };
}

export async function cancelSession(formData: FormData): Promise<void> {
  await requireAnyRole(WAITER_ROLES);
  const sessionId = String(formData.get("sessionId") ?? "");
  const s = await prisma.tableSession.findUnique({
    where: { id: sessionId },
    include: {
      potOrders: { where: { voidedAt: null } },
      payments: true,
      mergedTables: { select: { tableId: true } },
    },
  });
  if (!s || s.status !== "OPEN") redirect("/waiter");
  if (s.payments.length > 0) redirect(`/waiter/session/${sessionId}`);

  await prisma.$transaction([
    prisma.tableMerge.deleteMany({ where: { sessionId } }),
    prisma.potOrder.updateMany({ where: { sessionId }, data: { voidedAt: new Date() } }),
    prisma.tableSession.update({
      where: { id: sessionId },
      data: { status: "CANCELLED", closedAt: new Date() },
    }),
  ]);
  emitFloor("table:update", { tableId: s.tableId });
  emitKitchen("pot:void", { sessionId });
  revalidatePath("/waiter");
  revalidatePath("/kitchen");
  redirect("/waiter");
}

export async function mergeTable(formData: FormData): Promise<void> {
  await requireAnyRole(WAITER_ROLES);
  const sessionId = String(formData.get("sessionId") ?? "");
  const tableId = String(formData.get("tableId") ?? "");
  if (!sessionId || !tableId) return;

  const [session, taken] = await Promise.all([
    prisma.tableSession.findUnique({ where: { id: sessionId } }),
    prisma.tableSession.findFirst({ where: { tableId, status: "OPEN" } }),
  ]);
  if (!session || session.status !== "OPEN") redirect("/waiter");
  if (taken) { revalidatePath(`/waiter/session/${sessionId}`); redirect(`/waiter/session/${sessionId}`); }

  await prisma.tableMerge.create({ data: { sessionId, tableId } });
  emitFloor("table:update", { tableId });
  revalidatePath(`/waiter/session/${sessionId}`);
  revalidatePath("/waiter");
  redirect(`/waiter/session/${sessionId}`);
}

export async function unmergeTable(formData: FormData): Promise<void> {
  await requireAnyRole(WAITER_ROLES);
  const mergeId = String(formData.get("mergeId") ?? "");
  const merge = await prisma.tableMerge.findUnique({ where: { id: mergeId } });
  if (!merge) return;
  await prisma.tableMerge.delete({ where: { id: mergeId } });
  emitFloor("table:update", { tableId: merge.tableId });
  revalidatePath(`/waiter/session/${merge.sessionId}`);
  revalidatePath("/waiter");
}

export async function changeTable(formData: FormData): Promise<void> {
  await requireAnyRole(WAITER_ROLES);
  const sessionId = String(formData.get("sessionId") ?? "");
  const newTableId = String(formData.get("tableId") ?? "");
  if (!sessionId || !newTableId) return;

  const session = await prisma.tableSession.findUnique({ where: { id: sessionId } });
  if (!session || session.status !== "OPEN") redirect("/waiter");

  const oldTableId = session.tableId;
  await prisma.tableSession.update({ where: { id: sessionId }, data: { tableId: newTableId } });
  emitFloor("table:update", { tableId: oldTableId });
  emitFloor("table:update", { tableId: newTableId });
  revalidatePath(`/waiter/session/${sessionId}`);
  revalidatePath("/waiter");
  redirect(`/waiter/session/${sessionId}`);
}
