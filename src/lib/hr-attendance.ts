import { prisma } from "./db";
import { mmTodayUTC, mmNow } from "./business-day";

/** All attendance rows for a month, keyed by employeeId+date string. */
export async function getMonthAttendance(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return prisma.attendance.findMany({
    where: { date: { gte: start, lt: end } },
    include: { employee: { include: { user: { select: { id: true, name: true } } } } },
    orderBy: [{ employeeId: "asc" }, { date: "asc" }],
  });
}

/**
 * Attendance summary for a single employee in a month (for payroll generation).
 *
 * Present-basis: a working day only counts toward pay if there's a positive
 * attendance record for it (PRESENT/OT, or REST_DAY if manually marked as an
 * ad-hoc day off). A working day with NO attendance row at all — e.g. every
 * day after an employee has left, or every day before a mid-month hire's
 * start date — counts as absent (unpaid), not as implicitly present. This is
 * what makes a mid-month departure or a mid-month start prorate correctly;
 * previously only explicit ABSENT/LEAVE rows reduced pay, so an employee with
 * no attendance rows at all for the rest of the month was paid in full.
 */
export async function getAttendanceSummary(
  employeeId: string,
  year: number,
  month: number,
  restDays: number[],
) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  const rows = await prisma.attendance.findMany({
    where: { employeeId, date: { gte: start, lt: end } },
  });
  const byDate = new Map(rows.map((r) => [r.date.toISOString().slice(0, 10), r]));

  const daysInMonth = new Date(year, month, 0).getDate();
  let workingDays = 0;
  let absentDays = 0;
  let otDays = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay(); // 0=Sun
    if (restDays.includes(dow)) continue; // scheduled rest day — not a working day at all

    workingDays++;
    const key = new Date(Date.UTC(year, month - 1, d)).toISOString().slice(0, 10);
    const row = byDate.get(key);

    if (!row) {
      // No attendance record on a working day — unpaid under present-basis.
      absentDays += 1;
    } else if (row.status === "ABSENT" || row.status === "LEAVE") {
      absentDays += row.dayType === "HALF" ? 0.5 : 1;
    } else if (row.status === "OT") {
      otDays += row.dayType === "HALF" ? 0.5 : 1;
    } else if (row.status === "PRESENT" && row.dayType === "HALF") {
      absentDays += 0.5; // half-day present = half-day unpaid
    }
    // PRESENT+FULL or REST_DAY (manually marked ad-hoc day off) → fully
    // accounted for, no deduction.
  }

  return { workingDays, absentDays, otDays };
}

/** Today's attendance record for an employee, or null if none yet. */
export async function getTodayAttendance(employeeId: string) {
  return prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId, date: mmTodayUTC() } },
  });
}

/** Live status of all active employees: current clock state today. */
export async function getLiveAttendanceStatus() {
  const today = mmTodayUTC();
  const nowMM = mmNow();
  const now = new Date();
  const dayOfWeek = nowMM.getUTCDay(); // 0=Sun … 6=Sat (Myanmar weekday)
  // After 11:30 PM Myanmar, treat unclocked employees as auto-clocked-out
  const pastAutoClockOut = nowMM.getUTCHours() === 23 && nowMM.getUTCMinutes() >= 30;

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
