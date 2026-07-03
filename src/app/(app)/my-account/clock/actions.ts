"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { emitHR } from "@/lib/realtime";
import { notifyManagers } from "@/lib/notifications";
import { mmTodayUTC } from "@/lib/business-day";

/** Returns UTC midnight of the current date in Myanmar time (UTC+6:30). */
function todayDate() {
  return mmTodayUTC();
}

async function getOrCreateAttendance(employeeId: string) {
  const date = todayDate();
  return prisma.attendance.upsert({
    where: { employeeId_date: { employeeId, date } },
    update: {},
    create: { employeeId, date, status: "PRESENT" },
  });
}

export async function clockIn() {
  const session = await requireSession();
  const emp = await prisma.employee.findUnique({ where: { userId: session.id } });
  if (!emp) throw new Error("No employee profile found");

  const att = await getOrCreateAttendance(emp.userId);
  // Idempotent: if already clocked in (double-tap), just refresh the page
  if (att.clockInAt) {
    revalidatePath("/my-account/clock");
    return;
  }

  await prisma.attendance.update({
    where: { id: att.id },
    data: { clockInAt: new Date(), status: "PRESENT" },
  });

  emitHR("attendance:update", { employeeId: emp.userId, event: "clock_in" });
  revalidatePath("/my-account/clock");
}

export async function clockOut() {
  const session = await requireSession();
  const emp = await prisma.employee.findUnique({ where: { userId: session.id } });
  if (!emp) throw new Error("No employee profile found");

  const date = todayDate();
  const att = await prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId: emp.userId, date } },
    include: { breaks: true },
  });
  // Idempotent: already clocked out or not yet clocked in → just refresh
  if (!att || !att.clockInAt || att.clockOutAt) {
    revalidatePath("/my-account/clock");
    return;
  }

  // Close any open break before clocking out
  const openBreak = att.breaks.find((b) => !b.endAt);
  if (openBreak) {
    await prisma.attendanceBreak.update({
      where: { id: openBreak.id },
      data: { endAt: new Date() },
    });
  }

  await prisma.attendance.update({
    where: { id: att.id },
    data: { clockOutAt: new Date() },
  });

  emitHR("attendance:update", { employeeId: emp.userId, event: "clock_out" });
  revalidatePath("/my-account/clock");
}

export async function breakOut() {
  const session = await requireSession();
  const emp = await prisma.employee.findUnique({
    where: { userId: session.id },
    include: { user: { select: { name: true } } },
  });
  if (!emp) throw new Error("No employee profile found");

  const date = todayDate();
  const att = await prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId: emp.userId, date } },
    include: { breaks: true },
  });
  if (!att || !att.clockInAt || att.clockOutAt) {
    revalidatePath("/my-account/clock");
    return;
  }

  // Idempotent: already on break → just refresh
  const openBreak = att.breaks.find((b) => !b.endAt);
  if (openBreak) {
    revalidatePath("/my-account/clock");
    return;
  }

  await prisma.attendanceBreak.create({
    data: { attendanceId: att.id, startAt: new Date() },
  });

  emitHR("break:out", { employeeId: emp.userId, name: emp.user.name });
  await notifyManagers("BREAK_OUT", `${emp.user.name} went on break`, att.id);
  revalidatePath("/my-account/clock");
}

export async function breakIn() {
  const session = await requireSession();
  const emp = await prisma.employee.findUnique({
    where: { userId: session.id },
    include: { user: { select: { name: true } } },
  });
  if (!emp) throw new Error("No employee profile found");

  const date = todayDate();
  const att = await prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId: emp.userId, date } },
    include: { breaks: true },
  });
  if (!att || att.clockOutAt) {
    revalidatePath("/my-account/clock");
    return;
  }

  // Idempotent: not on break → just refresh
  const openBreak = att.breaks.find((b) => !b.endAt);
  if (!openBreak) {
    revalidatePath("/my-account/clock");
    return;
  }

  await prisma.attendanceBreak.update({
    where: { id: openBreak.id },
    data: { endAt: new Date() },
  });

  emitHR("break:in", { employeeId: emp.userId, name: emp.user.name });
  await notifyManagers("BREAK_IN", `${emp.user.name} returned from break`, att.id);
  revalidatePath("/my-account/clock");
}
