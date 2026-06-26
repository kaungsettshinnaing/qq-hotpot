import Link from "next/link";
import { prisma } from "@/lib/db";
import { getLiveAttendanceStatus } from "@/lib/hr-attendance";

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

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Manager Dashboard</h1>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">

        {/* Working now */}
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-2xl font-bold text-green-600">{workingList.length}</div>
          <div className="text-sm text-gray-600">Working now</div>
          {workingList.length > 0 && (
            <ul className="mt-2 space-y-0.5 border-t border-gray-100 pt-2">
              {workingList.map((s) => (
                <li key={s.employeeId} className="text-xs text-gray-700 font-medium">{s.name}</li>
              ))}
            </ul>
          )}
        </div>

        {/* On break */}
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

        {/* Pending leave */}
        <div className={`rounded-xl border bg-white p-4 shadow-sm ${pendingLeave > 0 ? "border-red-300" : ""}`}>
          <div className="text-2xl font-bold text-brand">{pendingLeave}</div>
          <div className="text-sm text-gray-600">Pending leave requests</div>
          {pendingLeave > 0 && <Link href="/manager/leave" className="text-xs text-brand hover:underline">Review →</Link>}
        </div>

        {/* Unapproved attendance */}
        <div className={`rounded-xl border bg-white p-4 shadow-sm ${pendingAtt > 0 ? "border-orange-300" : ""}`}>
          <div className="text-2xl font-bold text-orange-500">{pendingAtt}</div>
          <div className="text-sm text-gray-600">Unapproved attendance</div>
          {pendingAtt > 0 && <Link href="/manager/attendance" className="text-xs text-brand hover:underline">Approve →</Link>}
        </div>

      </div>
    </div>
  );
}
