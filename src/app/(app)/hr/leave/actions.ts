"use server";

import { revalidatePath } from "next/cache";
import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { mmDayOf } from "@/lib/business-day";

export async function hrReviewLeave(fd: FormData) {
  const session = await requireAnyRole(["HR", "ADMIN"]);
  const id = fd.get("id") as string;
  const action = fd.get("action") as "approve" | "reject";
  const status = action === "approve" ? "APPROVED" : "REJECTED";

  const req = await prisma.leaveRequest.update({
    where: { id },
    data: { status, reviewedById: session.id, reviewedAt: new Date() },
  });

  if (status === "APPROVED") {
    // Attendance.date convention is UTC midnight of the Myanmar calendar day
    const startDay = mmDayOf(req.startDate).getTime();
    const endDay = mmDayOf(req.endDate).getTime();
    for (let t = startDay; t <= endDay; t += 24 * 60 * 60 * 1000) {
      const date = new Date(t);
      await prisma.attendance.upsert({
        where: { employeeId_date: { employeeId: req.employeeId, date } },
        update: { status: "LEAVE" },
        create: { employeeId: req.employeeId, date, status: "LEAVE", isApproved: true, approvedById: session.id },
      });
    }
    await prisma.notification.create({
      data: { userId: req.employeeId, type: "LEAVE_APPROVED",
        message: `Your leave (${req.startDate.toLocaleDateString()} – ${req.endDate.toLocaleDateString()}) was approved`, relatedId: id },
    });
  } else {
    await prisma.notification.create({
      data: { userId: req.employeeId, type: "LEAVE_REJECTED",
        message: `Your leave (${req.startDate.toLocaleDateString()} – ${req.endDate.toLocaleDateString()}) was rejected`, relatedId: id },
    });
  }
  revalidatePath("/hr/leave");
}

export async function hrMarkAbsence(fd: FormData) {
  const session = await requireAnyRole(["HR", "ADMIN"]);
  const employeeId = fd.get("employeeId") as string;
  const date = mmDayOf(new Date(fd.get("date") as string));
  const status = (fd.get("status") as string) as "ABSENT" | "LEAVE";
  const note = (fd.get("note") as string | null) ?? "";

  await prisma.attendance.upsert({
    where: { employeeId_date: { employeeId, date } },
    update: { status, note: note || null },
    create: { employeeId, date, status, note: note || null, isApproved: true, approvedById: session.id },
  });
  revalidatePath("/hr/leave");
}
