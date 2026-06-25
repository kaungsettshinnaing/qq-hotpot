import { prisma } from "./db";
import { workingDaysInMonth } from "./hr-payroll";

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
  const absentDays = rows.filter((r) => r.status === "ABSENT" || r.status === "LEAVE").length;
  const otDays = rows.filter((r) => r.status === "OT").length;

  return { workingDays, absentDays, otDays };
}

/** Today's attendance record for an employee, or null if none yet. */
export async function getTodayAttendance(employeeId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId, date: today } },
  });
}

/** Live status of all active employees: current clock state today. */
export async function getLiveAttendanceStatus() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const employees = await prisma.employee.findMany({
    where: { isActive: true },
    include: {
      user: { select: { id: true, name: true } },
      attendances: {
        where: { date: today },
        take: 1,
      },
    },
    orderBy: { user: { name: "asc" } },
  });

  return employees.map((emp) => {
    const att = emp.attendances[0] ?? null;
    let status: "not_started" | "working" | "on_break" | "clocked_out" = "not_started";
    if (att) {
      if (att.clockOutAt) status = "clocked_out";
      else if (att.breakOutAt && !att.breakInAt) status = "on_break";
      else if (att.clockInAt) status = "working";
    }
    return {
      employeeId: emp.userId,
      name: emp.user.name,
      attendance: att,
      status,
    };
  });
}
