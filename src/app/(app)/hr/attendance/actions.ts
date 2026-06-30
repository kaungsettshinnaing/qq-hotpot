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
  const target = `${y}-${m}-${d}`;
  // Store on the upsert path as UTC midnight of the chosen calendar day.
  const date = new Date(Date.UTC(y, m - 1, d));
  const status = (fd.get("status") as string).trim();
  const note = (fd.get("note") as string | null) ?? "";

  if (!status) {
    // Blank = clear attendance for this employee on this calendar day.
    // Records may have been stored as UTC midnight (clock-in) OR local/Yangon midnight
    // (older manual marks via setHours), which land on different UTC instants. Fetch a
    // ±1-day window and match by either UTC-day or local-day interpretation, then delete.
    const windowStart = new Date(Date.UTC(y, m - 1, d - 1));
    const windowEnd = new Date(Date.UTC(y, m - 1, d + 2));
    const candidates = await prisma.attendance.findMany({
      where: { employeeId, date: { gte: windowStart, lt: windowEnd } },
      select: { id: true, date: true },
    });
    const ids = candidates
      .filter((c) => {
        const utcDay = `${c.date.getUTCFullYear()}-${c.date.getUTCMonth() + 1}-${c.date.getUTCDate()}`;
        const locDay = `${c.date.getFullYear()}-${c.date.getMonth() + 1}-${c.date.getDate()}`;
        return utcDay === target || locDay === target;
      })
      .map((c) => c.id);
    if (ids.length) {
      await prisma.attendance.deleteMany({ where: { id: { in: ids } } });
    }
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
