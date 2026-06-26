"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAnyRole } from "@/lib/auth";
import { setSetting } from "@/lib/settings";
import { ALL_ROLES, type Role } from "@/lib/rbac";

const ADMIN: Role[] = ["ADMIN"];

function str(v: unknown, max = 200): string {
  return String(v ?? "").trim().slice(0, max);
}
function clampInt(v: unknown, min: number, max: number): number {
  const n = parseInt(String(v ?? ""), 10);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}
function clampNum(v: unknown, min: number, max: number): number {
  const n = parseFloat(String(v ?? ""));
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

// ---- Areas & Tables ----

export async function createArea(formData: FormData): Promise<void> {
  await requireAnyRole(ADMIN);
  const name = str(formData.get("name"), 50);
  if (!name) redirect("/admin/tables?error=missing");
  const count = await prisma.area.count();
  await prisma.area.upsert({
    where: { name },
    update: { isActive: true },
    create: { name, sortOrder: count },
  });
  revalidatePath("/admin/tables");
  redirect("/admin/tables");
}

export async function moveArea(formData: FormData): Promise<void> {
  await requireAnyRole(ADMIN);
  const id = str(formData.get("id"));
  const direction = str(formData.get("direction")) as "up" | "down";
  const all = await prisma.area.findMany({ orderBy: { sortOrder: "asc" } });
  const idx = all.findIndex((a) => a.id === id);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || swapIdx < 0 || swapIdx >= all.length) return;
  await prisma.$transaction([
    prisma.area.update({ where: { id: all[idx].id },     data: { sortOrder: all[swapIdx].sortOrder } }),
    prisma.area.update({ where: { id: all[swapIdx].id }, data: { sortOrder: all[idx].sortOrder } }),
  ]);
  revalidatePath("/admin/tables");
  revalidatePath("/waiter");
}

export async function toggleArea(formData: FormData): Promise<void> {
  await requireAnyRole(ADMIN);
  const id = str(formData.get("id"));
  const a = await prisma.area.findUnique({ where: { id } });
  if (a) await prisma.area.update({ where: { id }, data: { isActive: !a.isActive } });
  revalidatePath("/admin/tables");
  revalidatePath("/waiter");
}

export async function createTable(formData: FormData): Promise<void> {
  await requireAnyRole(ADMIN);
  const areaId = str(formData.get("areaId"));
  const number = clampInt(formData.get("number"), 1, 9999);
  const capacity = clampInt(formData.get("capacity"), 0, 999);
  const area = areaId ? await prisma.area.findUnique({ where: { id: areaId } }) : null;
  if (!area) redirect("/admin/tables?error=missing");
  const label = `${area.name}${number}`;
  await prisma.table.upsert({
    where: { label },
    update: { isActive: true, capacity: capacity || null },
    create: { areaId, number, label, capacity: capacity || null },
  });
  revalidatePath("/admin/tables");
  revalidatePath("/waiter");
  redirect("/admin/tables");
}

export async function toggleTable(formData: FormData): Promise<void> {
  await requireAnyRole(ADMIN);
  const id = str(formData.get("id"));
  const t = await prisma.table.findUnique({ where: { id } });
  if (t) await prisma.table.update({ where: { id }, data: { isActive: !t.isActive } });
  revalidatePath("/admin/tables");
  revalidatePath("/waiter");
}

// ---- Menu & settings ----

export async function updateMenuItem(formData: FormData): Promise<void> {
  await requireAnyRole(ADMIN);
  const code = str(formData.get("code"), 50);
  const name = str(formData.get("name"), 100);
  const category = str(formData.get("category"), 100);
  const price = clampInt(formData.get("price"), 0, 1_000_000_000);
  await prisma.menuItem.update({
    where: { code },
    data: { price, category, ...(name ? { name } : {}) },
  });
  revalidatePath("/admin/menu");
}

export async function createMenuItem(formData: FormData): Promise<void> {
  await requireAnyRole(ADMIN);
  const name = str(formData.get("name"), 100);
  const category = str(formData.get("category"), 100);
  const price = clampInt(formData.get("price"), 0, 1_000_000_000);
  const unit = str(formData.get("unit")) === "GRAM" ? ("GRAM" as const) : ("UNIT" as const);
  if (!name) redirect("/admin/menu?error=missing");
  const code = name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 50);
  await prisma.menuItem.upsert({
    where: { code },
    update: { name, category, price, unit, isActive: true },
    create: { code, name, category, price, unit },
  });
  revalidatePath("/admin/menu");
  redirect("/admin/menu");
}

export async function toggleMenuItem(formData: FormData): Promise<void> {
  await requireAnyRole(ADMIN);
  const code = str(formData.get("code"), 50);
  const item = await prisma.menuItem.findUnique({ where: { code } });
  if (item) await prisma.menuItem.update({ where: { code }, data: { isActive: !item.isActive } });
  revalidatePath("/admin/menu");
}

export async function updateSettings(formData: FormData): Promise<void> {
  await requireAnyRole(ADMIN);
  await setSetting("restaurantName", str(formData.get("restaurantName"), 100) || "QQ Hotpot BBQ");
  await setSetting("currency", str(formData.get("currency"), 10) || "MMK");
  await setSetting("freePotRatio", clampInt(formData.get("freePotRatio"), 1, 99));
  await setSetting("freePotRounding", str(formData.get("freePotRounding")) === "DOWN" ? "DOWN" : "UP");
  await setSetting("reservationBlockMins", clampInt(formData.get("reservationBlockMins"), 0, 1440));
  await setSetting("serviceEnabled", formData.get("serviceEnabled") === "on");
  await setSetting("serviceRatePct", clampNum(formData.get("serviceRatePct"), 0, 100));
  await setSetting("taxEnabled", formData.get("taxEnabled") === "on");
  await setSetting("taxRatePct", clampNum(formData.get("taxRatePct"), 0, 100));
  revalidatePath("/admin/menu");
  revalidatePath("/");
  redirect("/admin/menu");
}

// ---- Soup flavours ----

export async function createFlavour(formData: FormData): Promise<void> {
  await requireAnyRole(ADMIN);
  const name = str(formData.get("name"), 100);
  const appliesToRaw = str(formData.get("appliesTo"));
  const appliesTo =
    appliesToRaw === "HOTPOT" || appliesToRaw === "BBQ" ? appliesToRaw : "BOTH";
  if (!name) redirect("/admin/flavours?error=missing");
  const count = await prisma.soupFlavour.count();
  await prisma.soupFlavour.upsert({
    where: { name },
    update: { appliesTo, isActive: true },
    create: { name, appliesTo, sortOrder: count },
  });
  revalidatePath("/admin/flavours");
  redirect("/admin/flavours");
}

export async function toggleFlavour(formData: FormData): Promise<void> {
  await requireAnyRole(ADMIN);
  const id = str(formData.get("id"));
  const f = await prisma.soupFlavour.findUnique({ where: { id } });
  if (f) await prisma.soupFlavour.update({ where: { id }, data: { isActive: !f.isActive } });
  revalidatePath("/admin/flavours");
}

export async function moveFlavour(formData: FormData): Promise<void> {
  await requireAnyRole(ADMIN);
  const id = str(formData.get("id"));
  const direction = str(formData.get("direction")) as "up" | "down";
  const all = await prisma.soupFlavour.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const idx = all.findIndex((f) => f.id === id);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || swapIdx < 0 || swapIdx >= all.length) return;
  await prisma.$transaction([
    prisma.soupFlavour.update({ where: { id: all[idx].id },     data: { sortOrder: all[swapIdx].sortOrder } }),
    prisma.soupFlavour.update({ where: { id: all[swapIdx].id }, data: { sortOrder: all[idx].sortOrder } }),
  ]);
  revalidatePath("/admin/flavours");
  revalidatePath("/waiter");
}

// ---- Expense categories ----

export async function createCategory(formData: FormData): Promise<void> {
  await requireAnyRole(ADMIN);
  const name = str(formData.get("name"), 100);
  const isStock = formData.get("isStock") === "on";
  if (!name) redirect("/admin/categories?error=missing");
  await prisma.expenseCategory.upsert({
    where: { name },
    update: { isActive: true },
    create: { name, isStock },
  });
  revalidatePath("/admin/categories");
  redirect("/admin/categories");
}

export async function toggleCategory(formData: FormData): Promise<void> {
  await requireAnyRole(ADMIN);
  const id = str(formData.get("id"));
  const c = await prisma.expenseCategory.findUnique({ where: { id } });
  if (c) await prisma.expenseCategory.update({ where: { id }, data: { isActive: !c.isActive } });
  revalidatePath("/admin/categories");
}

export async function toggleCategoryStock(formData: FormData): Promise<void> {
  await requireAnyRole(ADMIN);
  const id = str(formData.get("id"));
  const c = await prisma.expenseCategory.findUnique({ where: { id } });
  if (c) await prisma.expenseCategory.update({ where: { id }, data: { isStock: !c.isStock } });
  revalidatePath("/admin/categories");
}

// ---- Staff roles ----

function rolesFromForm(formData: FormData): Role[] {
  return ALL_ROLES.filter((r) => formData.get(`role_${r}`) === "on");
}

export async function createStaffRole(formData: FormData): Promise<void> {
  await requireAnyRole(ADMIN);
  const name = str(formData.get("name"), 100);
  if (!name) redirect("/admin/roles?error=missing");
  const permissions = rolesFromForm(formData);
  await prisma.staffRole.upsert({
    where: { name },
    update: { permissions, isActive: true },
    create: { name, permissions },
  });
  revalidatePath("/admin/roles");
  redirect("/admin/roles");
}

export async function updateStaffRole(formData: FormData): Promise<void> {
  await requireAnyRole(ADMIN);
  const id = str(formData.get("id"));
  const name = str(formData.get("name"), 100);
  const permissions = rolesFromForm(formData);
  if (!name || !id) return;
  await prisma.staffRole.update({ where: { id }, data: { name, permissions } });
  revalidatePath("/admin/roles");
}

export async function toggleStaffRole(formData: FormData): Promise<void> {
  await requireAnyRole(ADMIN);
  const id = str(formData.get("id"));
  const r = await prisma.staffRole.findUnique({ where: { id } });
  if (r) await prisma.staffRole.update({ where: { id }, data: { isActive: !r.isActive } });
  revalidatePath("/admin/roles");
}

