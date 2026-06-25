"use server";

import { revalidatePath } from "next/cache";
import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { AttendanceStatus } from "@prisma/client";

export async function markAttendance(fd: FormData) {
  const session = await requireAnyRole(["HR", "ADMIN", "MANAGER"]);
  const employeeId = fd.get("employeeId") as string;
  const date = new Date(fd.get("date") as string);
  date.setHours(0, 0, 0, 0);
  const status = fd.get("status") as AttendanceStatus;
  const note = (fd.get("note") as string | null) ?? "";

  await prisma.attendance.upsert({
    where: { employeeId_date: { employeeId, date } },
    update: { status, note: note || null, isApproved: true, approvedById: session.id },
    create: { employeeId, date, status, note: note || null, isApproved: true, approvedById: session.id },
  });
  revalidatePath("/hr/attendance");
}

export async function approveAttendance(fd: FormData) {
  const session = await requireAnyRole(["HR", "ADMIN", "MANAGER"]);
  const id = fd.get("id") as string;
  await prisma.attendance.update({
    where: { id },
    data: { isApproved: true, approvedById: session.id },
  });
  revalidatePath("/hr/attendance");
}
