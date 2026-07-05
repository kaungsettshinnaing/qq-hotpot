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
  const direction = String(formData.get("direction") ?? "") === "REMOVE" ? "REMOVE" : "ADD";
  const qty = parseInt(String(formData.get("qty") ?? ""), 10);
  const note = String(formData.get("note") ?? "").trim().slice(0, 200) || null;

  if (!stockItemId || Number.isNaN(qty) || qty <= 0) {
    redirect("/inventory/usage?error=invalid");
  }

  const diff = direction === "REMOVE" ? -qty : qty;
  const defaultNote = direction === "REMOVE" ? `Manual adjustment: −${qty}` : `Manual adjustment: +${qty}`;

  const result = await prisma.stockMovement.aggregate({
    where: { stockItemId },
    _sum: { qty: true },
  });
  const currentQty = result._sum.qty ?? 0;

  await prisma.stockMovement.create({
    data: {
      stockItemId,
      type: "ADJUSTMENT",
      qty: diff,
      previousQty: currentQty,
      note: note ?? defaultNote,
      recordedById: session.id,
    },
  });

  revalidatePath("/inventory");
  revalidatePath("/inventory/usage");
  redirect("/inventory/usage");
}
