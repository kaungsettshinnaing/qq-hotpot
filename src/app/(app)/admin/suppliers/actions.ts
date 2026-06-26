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

export async function createSupplier(formData: FormData): Promise<void> {
  await requireAnyRole(ADMIN);
  const name = str(formData.get("name"), 100);
  const contact = str(formData.get("contact"), 100) || null;
  const phone = str(formData.get("phone"), 50) || null;
  const address = str(formData.get("address"), 200) || null;
  const notes = str(formData.get("notes"), 500) || null;
  if (!name) redirect("/admin/suppliers?error=missing");
  await prisma.supplier.create({ data: { name, contact, phone, address, notes } });
  revalidatePath("/admin/suppliers");
  redirect("/admin/suppliers");
}

export async function updateSupplier(formData: FormData): Promise<void> {
  await requireAnyRole(ADMIN);
  const id = str(formData.get("id"));
  const name = str(formData.get("name"), 100);
  const contact = str(formData.get("contact"), 100) || null;
  const phone = str(formData.get("phone"), 50) || null;
  const address = str(formData.get("address"), 200) || null;
  const notes = str(formData.get("notes"), 500) || null;
  if (!name) redirect("/admin/suppliers?error=missing");
  await prisma.supplier.update({ where: { id }, data: { name, contact, phone, address, notes } });
  revalidatePath("/admin/suppliers");
  redirect("/admin/suppliers");
}

export async function toggleSupplier(formData: FormData): Promise<void> {
  await requireAnyRole(ADMIN);
  const id = str(formData.get("id"));
  const s = await prisma.supplier.findUnique({ where: { id } });
  if (s) await prisma.supplier.update({ where: { id }, data: { isActive: !s.isActive } });
  revalidatePath("/admin/suppliers");
}
