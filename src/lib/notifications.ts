import { prisma } from "./db";
import { emitHR } from "./realtime";
import type { NotifType } from "@prisma/client";

/** Creates a notification row and emits it to the hr Socket.IO room. */
export async function createNotification(
  userId: string,
  type: NotifType,
  message: string,
  relatedId?: string,
) {
  const notif = await prisma.notification.create({
    data: { userId, type, message, relatedId },
  });
  emitHR("notification:new", { userId, type, message, id: notif.id });
  return notif;
}

/** Notify all users with MANAGER or ADMIN roles. */
export async function notifyManagers(type: NotifType, message: string, relatedId?: string) {
  const managers = await prisma.user.findMany({
    where: {
      isActive: true,
      roles: { hasSome: ["MANAGER", "ADMIN"] },
    },
    select: { id: true },
  });
  await Promise.all(
    managers.map((m) => createNotification(m.id, type, message, relatedId)),
  );
}
