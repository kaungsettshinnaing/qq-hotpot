import Link from "next/link";
import { prisma } from "@/lib/db";
import { getLiveAttendanceStatus } from "@/lib/hr-attendance";
import LiveAttendance from "./attendance/LiveAttendance";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

function fmtMins(mins: number) {
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default async function ManagerDashboard() {
  const t = await getT();
  const [statuses, pendingLeave, pendingAtt, unconfirmedExp] = await Promise.all([
    getLiveAttendanceStatus(),
    prisma.leaveRequest.count({ where: { status: "PENDING" } }),
    prisma.attendance.count({ where: { isApproved: false, status: { not: "REST_DAY" } } }),
    prisma.expense.count({ where: { confirmedAt: null } }),
  ]);

  const workingList    = statuses.filter((s) => s.status === "working");
  const onBreakList    = statuses.filter((s) => s.status === "on_break");
  const restDayList    = statuses.filter((s) => s.status === "rest");
  const notClockedIn   = statuses.filter((s) => s.status === "not_started");
  const clockedOutList = statuses.filter((s) => s.status === "clocked_out");

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
      <h1 className="text-xl font-bold">{t("nav_manager")}</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-2xl font-bold text-green-600">{workingList.length}</div>
          <div className="text-sm text-gray-600">{t("card_working_now")}</div>
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
          <div className="text-sm text-gray-600">{t("card_on_break")}</div>
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

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-2xl font-bold text-violet-500">{restDayList.length}</div>
          <div className="text-sm text-gray-600">{t("card_rest_day")}</div>
          {restDayList.length > 0 && (
            <ul className="mt-2 space-y-0.5 border-t border-gray-100 pt-2">
              {restDayList.map((s) => (
                <li key={s.employeeId} className="text-xs font-medium text-violet-700">{s.name}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-2xl font-bold text-gray-400">{notClockedIn.length}</div>
          <div className="text-sm text-gray-600">{t("card_not_clocked_in")}</div>
          {notClockedIn.length > 0 && (
            <ul className="mt-2 space-y-0.5 border-t border-gray-100 pt-2">
              {notClockedIn.map((s) => (
                <li key={s.employeeId} className="text-xs font-medium text-gray-500">{s.name}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-2xl font-bold text-gray-500">{clockedOutList.length}</div>
          <div className="text-sm text-gray-600">{t("card_clocked_out")}</div>
          {clockedOutList.length > 0 && (
            <ul className="mt-2 space-y-0.5 border-t border-gray-100 pt-2">
              {clockedOutList.map((s) => (
                <li key={s.employeeId} className="text-xs font-medium text-gray-500">{s.name}</li>
              ))}
            </ul>
          )}
        </div>

        <div className={`rounded-xl border bg-white p-4 shadow-sm ${pendingLeave > 0 ? "border-red-300" : ""}`}>
          <div className="text-2xl font-bold text-brand">{pendingLeave}</div>
          <div className="text-sm text-gray-600">{t("card_pending_leave")}</div>
          {pendingLeave > 0 && (
            <Link href="/manager/leave" className="text-xs text-brand hover:underline">{t("link_review")} →</Link>
          )}
        </div>

        <div className={`rounded-xl border bg-white p-4 shadow-sm ${pendingAtt > 0 ? "border-orange-300" : ""}`}>
          <div className="text-2xl font-bold text-orange-500">{pendingAtt}</div>
          <div className="text-sm text-gray-600">{t("card_unapproved_attendance")}</div>
          {pendingAtt > 0 && (
            <Link href="/reports?tab=attendance" className="text-xs text-brand hover:underline">{t("link_review")} →</Link>
          )}
        </div>

        <div className={`rounded-xl border bg-white p-4 shadow-sm ${unconfirmedExp > 0 ? "border-amber-300" : ""}`}>
          <div className="text-2xl font-bold text-amber-600">{unconfirmedExp}</div>
          <div className="text-sm text-gray-600">{t("card_unconfirmed_expenses")}</div>
          {unconfirmedExp > 0 && (
            <Link href="/manager/expenses" className="text-xs text-brand hover:underline">{t("link_review")} →</Link>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">{t("heading_live_attendance")}</h2>
          <Link href="/manager/attendance" className="text-xs text-brand hover:underline">{t("link_full_view")} →</Link>
        </div>
        <LiveAttendance entries={serialised} />
      </div>
    </div>
  );
}
