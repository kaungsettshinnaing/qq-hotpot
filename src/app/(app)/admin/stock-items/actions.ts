"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { StockUnit } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAnyRole } from "@/lib/auth";

import type { Role } from "@/lib/rbac";
const ADMIN: Role[] = ["ADMIN"];

function str(v: unknown, max = 200): string {
  return String(v ?? "").trim().slice(0, max);
}
function optInt(v: unknown): number | null {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isNaN(n) || n <= 0 ? null : n;
}

const VALID_UNITS: StockUnit[] = ["UNIT", "GRAM", "KG", "LITRE", "BOX", "BOTTLE", "PACK"];

export async function createStockItem(formData: FormData): Promise<void> {
  await requireAnyRole(ADMIN);
  const name = str(formData.get("name"), 100);
  const unitRaw = str(formData.get("unit")) as StockUnit;
  const unit = VALID_UNITS.includes(unitRaw) ? unitRaw : "UNIT";
  const minStock = optInt(formData.get("minStock"));
  const optimalStock = optInt(formData.get("optimalStock"));
  const categoryId = str(formData.get("categoryId")) || null;
  if (!name) redirect("/admin/stock-items?error=missing");
  await prisma.stockItem.create({ data: { name, unit, minStock, optimalStock, categoryId } });
  revalidatePath("/admin/stock-items");
  redirect("/admin/stock-items");
}

export async function updateStockItem(formData: FormData): Promise<void> {
  await requireAnyRole(ADMIN);
  const id = str(formData.get("id"));
  const name = str(formData.get("name"), 100);
  const unitRaw = str(formData.get("unit")) as StockUnit;
  const unit = VALID_UNITS.includes(unitRaw) ? unitRaw : "UNIT";
  const minStock = optInt(formData.get("minStock"));
  const optimalStock = optInt(formData.get("optimalStock"));
  const categoryId = str(formData.get("categoryId")) || null;
  if (!name) redirect("/admin/stock-items?error=missing");
  await prisma.stockItem.update({ where: { id }, data: { name, unit, minStock, optimalStock, categoryId } });
  revalidatePath("/admin/stock-items");
  redirect("/admin/stock-items");
}

export async function toggleStockItem(formData: FormData): Promise<void> {
  await requireAnyRole(ADMIN);
  const id = str(formData.get("id"));
  const item = await prisma.stockItem.findUnique({ where: { id } });
  if (item) await prisma.stockItem.update({ where: { id }, data: { isActive: !item.isActive } });
  revalidatePath("/admin/stock-items");
}
