"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAnyRole } from "@/lib/auth";
import { emitKitchen, emitFloor } from "@/lib/realtime";

export async function deliverPot(formData: FormData): Promise<void> {
  const user = await requireAnyRole(["KITCHEN", "MANAGER", "ADMIN"]);
  const potId = String(formData.get("potId") ?? "");
  const pot = await prisma.potOrder.findUnique({
    where: { id: potId },
    include: { session: true },
  });
  if (!pot || pot.voidedAt || pot.status === "DELIVERED") return;

  await prisma.potOrder.update({
    where: { id: potId },
    data: { status: "DELIVERED", deliveredById: user.id, deliveredAt: new Date() },
  });
  emitKitchen("pot:delivered", { potId });
  emitFloor("table:update", { tableId: pot.session.tableId });
  revalidatePath("/kitchen");
}
