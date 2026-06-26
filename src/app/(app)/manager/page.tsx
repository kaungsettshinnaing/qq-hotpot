import Link from "next/link";
import { prisma } from "@/lib/db";
import { getLiveAttendanceStatus } from "@/lib/hr-attendance";
import LiveAttendance from "./attendance/LiveAttendance";

export const dynamic = "force-dynamic";

function fmtMins(mins: number) {
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default async function ManagerDashboard() {
  const [statuses, pendingLeave, pendingAtt] = await Promise.all([
    getLiveAttendanceStatus(),
    prisma.leaveRequest.count({ where: { status: "PENDING" } }),
    prisma.attendance.count({ where: { isApproved: false, status: { not: "REST_DAY" } } }),
  ]);

  const workingList = statuses.filter((s) => s.status === "working");
  const onBreakList = statuses.filter((s) => s.status === "on_break");

  const serialised = statuses.map((e) => ({
    employeeId: e.employeeId,
    name: e.name,
    status: e.status,
    isRestDay: e.isRestDay,
    clockInAt: e.attendance?.clockInAt?.toISOString() ?? null,
    clockOutAt: e.attendance?.clockOutAt?.toISOString() ?? null,
    breakCount: e.breakCount,
    totalBreakMins: e.totalBreakMins,
    currentBreakStartAt: e.openBreak?.startAt.toISOString() ?? null,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Manager Dashboard</h1>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-2xl font-bold text-green-600">{workingList.length}</div>
          <div className="text-sm text-gray-600">Working now</div>
          {workingList.length > 0 && (
            <ul className="mt-2 space-y-0.5 border-t border-gray-100 pt-2">
              {workingList.map((s) => (
                <li key={s.employeeId} className="text-xs font-medium text-gray-700">{s.name}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-2xl font-bold text-yellow-500">{onBreakList.length}</div>
          <div className="text-sm text-gray-600">On break</div>
          {onBreakList.length > 0 && (
            <ul className="mt-2 space-y-0.5 border-t border-gray-100 pt-2">
              {onBreakList.map((s) => (
                <li key={s.employeeId} className="text-xs text-gray-700">
                  <span className="font-medium">{s.name}</span>
                  {s.totalBreakMins > 0 && (
                    <span className="ml-1 text-yellow-600">({fmtMins(s.totalBreakMins)})</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={`rounded-xl border bg-white p-4 shadow-sm ${pendingLeave > 0 ? "border-red-300" : ""}`}>
          <div className="text-2xl font-bold text-brand">{pendingLeave}</div>
          <div className="text-sm text-gray-600">Pending leave</div>
          {pendingLeave > 0 && (
            <Link href="/manager/leave" className="text-xs text-brand hover:underline">Review →</Link>
          )}
        </div>

        <div className={`rounded-xl border bg-white p-4 shadow-sm ${pendingAtt > 0 ? "border-orange-300" : ""}`}>
          <div className="text-2xl font-bold text-orange-500">{pendingAtt}</div>
          <div className="text-sm text-gray-600">Unapproved attendance</div>
          {pendingAtt > 0 && (
            <Link href="/reports?tab=attendance" className="text-xs text-brand hover:underline">
              Review →
            </Link>
          )}
        </div>
      </div>

      {/* ── Live Attendance ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">Live Attendance — Today</h2>
          <Link href="/manager/attendance" className="text-xs text-brand hover:underline">
            Full view →
          </Link>
        </div>
        <LiveAttendance entries={serialised} />
      </div>
    </div>
  );
}
