"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAnyRole, requireSession } from "@/lib/auth";

export async function recordUsage(formData: FormData): Promise<void> {
  const session = await requireSession();
  await requireAnyRole(["WAITER", "KITCHEN", "MANAGER", "ADMIN"]);

  const stockItemId = String(formData.get("stockItemId") ?? "").trim();
  const qty = parseInt(String(formData.get("qty") ?? ""), 10);
  const note = String(formData.get("note") ?? "").trim().slice(0, 200) || null;

  if (!stockItemId || Number.isNaN(qty) || qty <= 0) {
    redirect("/inventory/usage/new?error=invalid");
  }

  await prisma.stockMovement.create({
    data: {
      stockItemId,
      type: "USAGE_OUT",
      qty: -qty, // negative = out
      note,
      recordedById: session.id,
    },
  });

  revalidatePath("/inventory");
  revalidatePath("/inventory/usage");
  redirect("/inventory/usage");
}

export async function recordAdjustment(formData: FormData): Promise<void> {
  const session = await requireSession();
  await requireAnyRole(["MANAGER", "ADMIN"]);

  const stockItemId = String(formData.get("stockItemId") ?? "").trim();
  const newQty = parseInt(String(formData.get("newQty") ?? ""), 10);
  const note = String(formData.get("note") ?? "").trim().slice(0, 200) || null;

  if (!stockItemId || Number.isNaN(newQty) || newQty < 0) {
    redirect("/inventory/usage?error=invalid");
  }

  // Compute current stock and set adjustment to reach newQty
  const result = await prisma.stockMovement.aggregate({
    where: { stockItemId },
    _sum: { qty: true },
  });
  const current = result._sum.qty ?? 0;
  const diff = newQty - current;
  if (diff === 0) {
    redirect("/inventory/usage");
  }

  await prisma.stockMovement.create({
    data: {
      stockItemId,
      type: "ADJUSTMENT",
      qty: diff,
      note: note ?? `Manual adjustment to ${newQty}`,
      recordedById: session.id,
    },
  });

  revalidatePath("/inventory");
  revalidatePath("/inventory/usage");
  redirect("/inventory/usage");
}
