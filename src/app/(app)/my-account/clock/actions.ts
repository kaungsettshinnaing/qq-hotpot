"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { emitHR } from "@/lib/realtime";
import { notifyManagers } from "@/lib/notifications";

function todayDate() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
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
  if (att.clockInAt) throw new Error("Already clocked in today");

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
  if (!att || !att.clockInAt) throw new Error("Not clocked in today");
  if (att.clockOutAt) throw new Error("Already clocked out");

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
  if (!att || !att.clockInAt) throw new Error("Not clocked in");
  if (att.clockOutAt) throw new Error("Already clocked out");

  const openBreak = att.breaks.find((b) => !b.endAt);
  if (openBreak) throw new Error("Already on break");

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
  if (!att) throw new Error("No attendance record today");
  if (att.clockOutAt) throw new Error("Already clocked out");

  const openBreak = att.breaks.find((b) => !b.endAt);
  if (!openBreak) throw new Error("Not on break");

  await prisma.attendanceBreak.update({
    where: { id: openBreak.id },
    data: { endAt: new Date() },
  });

  emitHR("break:in", { employeeId: emp.userId, name: emp.user.name });
  await notifyManagers("BREAK_IN", `${emp.user.name} returned from break`, att.id);
  revalidatePath("/my-account/clock");
}
