import { prisma } from "./db";
import { workingDaysInMonth } from "./hr-payroll";

const MM_OFFSET_MS = (6 * 60 + 30) * 60 * 1000; // UTC+6:30

/** UTC midnight of today's date in Myanmar time. Use this for DB DATE comparisons. */
function myanmarToday(): Date {
  const mmNow = new Date(Date.now() + MM_OFFSET_MS);
  return new Date(Date.UTC(mmNow.getUTCFullYear(), mmNow.getUTCMonth(), mmNow.getUTCDate()));
}

/** Returns current time shifted into Myanmar "virtual UTC" for hour/minute/day-of-week reads. */
function myanmarNow() {
  return new Date(Date.now() + MM_OFFSET_MS);
}

/** All attendance rows for a month, keyed by employeeId+date string. */
export async function getMonthAttendance(year: number, month: number) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return prisma.attendance.findMany({
    where: { date: { gte: start, lt: end } },
    include: { employee: { include: { user: { select: { id: true, name: true } } } } },
    orderBy: [{ employeeId: "asc" }, { date: "asc" }],
  });
}

/** Attendance summary for a single employee in a month (for payroll generation). */
export async function getAttendanceSummary(
  employeeId: string,
  year: number,
  month: number,
  restDays: number[],
) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);

  const rows = await prisma.attendance.findMany({
    where: { employeeId, date: { gte: start, lt: end } },
  });

  const workingDays = workingDaysInMonth(year, month, restDays);

  // Half-day rows count as 0.5; PRESENT+HALF means worked half, absent half
  const absentDays = rows.reduce((sum, r) => {
    const factor = r.dayType === "HALF" ? 0.5 : 1;
    if (r.status === "ABSENT" || r.status === "LEAVE") return sum + factor;
    if (r.status === "PRESENT" && r.dayType === "HALF") return sum + 0.5;
    return sum;
  }, 0);

  const otDays = rows.reduce((sum, r) => {
    if (r.status !== "OT") return sum;
    return sum + (r.dayType === "HALF" ? 0.5 : 1);
  }, 0);

  return { workingDays, absentDays, otDays };
}

/** Today's attendance record for an employee, or null if none yet. */
export async function getTodayAttendance(employeeId: string) {
  return prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId, date: myanmarToday() } },
  });
}

/** Live status of all active employees: current clock state today. */
export async function getLiveAttendanceStatus() {
  const today = myanmarToday();
  const mmNow = myanmarNow();
  const now = new Date();
  const dayOfWeek = mmNow.getUTCDay(); // 0=Sun … 6=Sat (Myanmar weekday)
  // After 11:30 PM Myanmar, treat unclocked employees as auto-clocked-out
  const pastAutoClockOut = mmNow.getUTCHours() === 23 && mmNow.getUTCMinutes() >= 30;

  const employees = await prisma.employee.findMany({
    where: { isActive: true, isSystem: false },
    include: {
      user: { select: { id: true, name: true } },
      attendances: {
        where: { date: today },
        take: 1,
        include: { breaks: { orderBy: { startAt: "asc" } } },
      },
      leaveRequests: {
        where: { status: "APPROVED", startDate: { lte: today }, endDate: { gte: today } },
        take: 1,
        select: { id: true },
      },
    },
    orderBy: { user: { name: "asc" } },
  });

  return employees.map((emp) => {
    const att = emp.attendances[0] ?? null;
    const openBreak = att?.breaks.find((b) => !b.endAt) ?? null;
    const isRestDay = emp.restDays.includes(dayOfWeek);

    let status: "not_started" | "working" | "on_break" | "clocked_out" | "on_leave" | "rest" = "not_started";
    if (att) {
      if (att.clockOutAt) status = "clocked_out";
      else if (att.clockInAt) {
        // After 11:30 PM Myanmar, auto-clock-out (display only — DB not modified)
        status = pastAutoClockOut ? "clocked_out" : openBreak ? "on_break" : "working";
      }
    } else if (emp.leaveRequests.length > 0) {
      status = "on_leave";
    } else if (isRestDay) {
      status = "rest";
    }

    const totalBreakMins = Math.floor(
      (att?.breaks ?? []).reduce((sum, b) => {
        return sum + ((b.endAt ?? now).getTime() - b.startAt.getTime()) / 60000;
      }, 0),
    );
    return {
      employeeId: emp.userId,
      name: emp.user.name,
      attendance: att,
      status,
      isRestDay,
      openBreak,
      breakCount: att?.breaks.length ?? 0,
      totalBreakMins,
    };
  });
}
