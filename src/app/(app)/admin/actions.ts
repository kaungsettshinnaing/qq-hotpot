"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { MenuItemCode } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAnyRole, hashPassword, hashPin } from "@/lib/auth";
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
  const sortOrder = clampInt(formData.get("sortOrder"), 0, 9999);
  if (!name) redirect("/admin/tables?error=missing");
  await prisma.area.upsert({
    where: { name },
    update: { sortOrder, isActive: true },
    create: { name, sortOrder },
  });
  revalidatePath("/admin/tables");
  redirect("/admin/tables");
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
  const code = str(formData.get("code")) as MenuItemCode;
  const name = str(formData.get("name"), 100);
  const price = clampInt(formData.get("price"), 0, 1_000_000_000);
  await prisma.menuItem.update({
    where: { code },
    data: { price, ...(name ? { name } : {}) },
  });
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
  const sortOrder = clampInt(formData.get("sortOrder"), 0, 9999);
  if (!name) redirect("/admin/flavours?error=missing");
  await prisma.soupFlavour.upsert({
    where: { name },
    update: { appliesTo, sortOrder, isActive: true },
    create: { name, appliesTo, sortOrder },
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

// ---- Users & roles ----

function rolesFromForm(formData: FormData): Role[] {
  return ALL_ROLES.filter((r) => formData.get(`role_${r}`) === "on");
}

export async function createUser(formData: FormData): Promise<void> {
  await requireAnyRole(ADMIN);
  const name = str(formData.get("name"), 100);
  const username = str(formData.get("username"), 50).toLowerCase();
  const password = str(formData.get("password"), 100);
  const pin = str(formData.get("pin"), 20);
  const roles = rolesFromForm(formData);
  if (!name || !username || !password) redirect("/admin/users?error=missing");
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) redirect("/admin/users?error=exists");
  await prisma.user.create({
    data: {
      name,
      username,
      passwordHash: hashPassword(password),
      roles,
      pinHash: pin ? hashPin(pin) : null,
    },
  });
  revalidatePath("/admin/users");
  redirect("/admin/users");
}

export async function updateUserRoles(formData: FormData): Promise<void> {
  await requireAnyRole(ADMIN);
  const id = str(formData.get("id"));
  await prisma.user.update({ where: { id }, data: { roles: rolesFromForm(formData) } });
  revalidatePath("/admin/users");
}

export async function setUserActive(formData: FormData): Promise<void> {
  await requireAnyRole(ADMIN);
  const id = str(formData.get("id"));
  const u = await prisma.user.findUnique({ where: { id } });
  if (u) await prisma.user.update({ where: { id }, data: { isActive: !u.isActive } });
  revalidatePath("/admin/users");
}

export async function resetUserPassword(formData: FormData): Promise<void> {
  await requireAnyRole(ADMIN);
  const id = str(formData.get("id"));
  const password = str(formData.get("password"), 100);
  if (password) await prisma.user.update({ where: { id }, data: { passwordHash: hashPassword(password) } });
  revalidatePath("/admin/users");
}
