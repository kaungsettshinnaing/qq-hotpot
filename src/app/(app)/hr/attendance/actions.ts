"use server";

import { revalidatePath } from "next/cache";
import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { AttendanceStatus } from "@prisma/client";

export async function markAttendance(fd: FormData) {
  const session = await requireAnyRole(["HR", "ADMIN", "MANAGER"]);
  const employeeId = fd.get("employeeId") as string;
  const rawDate = fd.get("date") as string; // "YYYY-MM-DD"
  const [y, m, d] = rawDate.split("-").map(Number);
  const dayStart = new Date(Date.UTC(y, m - 1, d));
  const dayEnd = new Date(Date.UTC(y, m - 1, d + 1));
  const date = dayStart;
  const status = (fd.get("status") as string).trim();
  const note = (fd.get("note") as string | null) ?? "";

  if (!status) {
    // Blank = clear attendance for this employee on this date (range to handle any stored time)
    await prisma.attendance.deleteMany({
      where: { employeeId, date: { gte: dayStart, lt: dayEnd } },
    });
  } else {
    await prisma.attendance.upsert({
      where: { employeeId_date: { employeeId, date } },
      update: { status: status as AttendanceStatus, note: note || null, isApproved: true, approvedById: session.id },
      create: { employeeId, date, status: status as AttendanceStatus, note: note || null, isApproved: true, approvedById: session.id },
    });
  }
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
