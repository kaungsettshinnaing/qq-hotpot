import Link from "next/link";
import { prisma } from "@/lib/db";
import { getLiveAttendanceStatus } from "@/lib/hr-attendance";

export default async function ManagerDashboard() {
  const [statuses, pendingLeave, pendingAtt] = await Promise.all([
    getLiveAttendanceStatus(),
    prisma.leaveRequest.count({ where: { status: "PENDING" } }),
    prisma.attendance.count({ where: { isApproved: false, status: { not: "REST_DAY" } } }),
  ]);

  const working = statuses.filter((s) => s.status === "working").length;
  const onBreak = statuses.filter((s) => s.status === "on_break").length;
  const notStarted = statuses.filter((s) => s.status === "not_started").length;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Manager Dashboard</h1>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-2xl font-bold text-green-600">{working}</div>
          <div className="text-sm text-gray-600">Working now</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-2xl font-bold text-yellow-500">{onBreak}</div>
          <div className="text-sm text-gray-600">On break</div>
        </div>
        <div className={`rounded-xl border bg-white p-4 shadow-sm ${pendingLeave > 0 ? "border-red-300" : ""}`}>
          <div className="text-2xl font-bold text-brand">{pendingLeave}</div>
          <div className="text-sm text-gray-600">Pending leave requests</div>
          {pendingLeave > 0 && <Link href="/manager/leave" className="text-xs text-brand hover:underline">Review →</Link>}
        </div>
        <div className={`rounded-xl border bg-white p-4 shadow-sm ${pendingAtt > 0 ? "border-orange-300" : ""}`}>
          <div className="text-2xl font-bold text-orange-500">{pendingAtt}</div>
          <div className="text-sm text-gray-600">Unapproved attendance</div>
          {pendingAtt > 0 && <Link href="/manager/attendance" className="text-xs text-brand hover:underline">Approve →</Link>}
        </div>
      </div>
    </div>
  );
}
