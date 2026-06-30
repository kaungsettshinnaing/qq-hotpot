"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAnyRole } from "@/lib/auth";
import type { Role } from "@/lib/rbac";

const ADMIN: Role[] = ["ADMIN"];

function str(v: unknown, max = 200): string {
  return String(v ?? "").trim().slice(0, max);
}

export async function createStockCategory(formData: FormData): Promise<void> {
  await requireAnyRole(ADMIN);
  const name = str(formData.get("name"), 100);
  if (!name) redirect("/admin/stock-categories?error=missing");
  await prisma.stockCategory.create({ data: { name } });
  revalidatePath("/admin/stock-categories");
  revalidatePath("/admin/stock-items");
  redirect("/admin/stock-categories");
}

export async function updateStockCategory(formData: FormData): Promise<void> {
  await requireAnyRole(ADMIN);
  const id = str(formData.get("id"));
  const name = str(formData.get("name"), 100);
  if (!name) redirect("/admin/stock-categories?error=missing");
  await prisma.stockCategory.update({ where: { id }, data: { name } });
  revalidatePath("/admin/stock-categories");
  revalidatePath("/admin/stock-items");
  redirect("/admin/stock-categories");
}

export async function toggleStockCategory(formData: FormData): Promise<void> {
  await requireAnyRole(ADMIN);
  const id = str(formData.get("id"));
  const cat = await prisma.stockCategory.findUnique({ where: { id } });
  if (cat) await prisma.stockCategory.update({ where: { id }, data: { isActive: !cat.isActive } });
  revalidatePath("/admin/stock-categories");
}
