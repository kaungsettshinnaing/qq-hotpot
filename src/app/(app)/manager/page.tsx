import Link from "next/link";
import { prisma } from "@/lib/db";
import { getLiveAttendanceStatus } from "@/lib/hr-attendance";
import { createFine } from "../hr/fines/actions";
import SubmitButton from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtMins(mins: number) {
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default async function ManagerDashboard() {
  const now = new Date();
  const [statuses, pendingLeave, pendingAtt, employees, recentFines] = await Promise.all([
    getLiveAttendanceStatus(),
    prisma.leaveRequest.count({ where: { status: "PENDING" } }),
    prisma.attendance.count({ where: { isApproved: false, status: { not: "REST_DAY" } } }),
    prisma.employee.findMany({
      where: { isActive: true, isSystem: false },
      include: { user: { select: { name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.employeeFine.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      include: { employee: { include: { user: { select: { name: true } } } } },
    }),
  ]);

  const workingList = statuses.filter((s) => s.status === "working");
  const onBreakList = statuses.filter((s) => s.status === "on_break");

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Manager Dashboard</h1>

      {/* ── Team overview cards ── */}
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
          <div className="text-sm text-gray-600">Pending leave requests</div>
          {pendingLeave > 0 && <Link href="/manager/leave" className="text-xs text-brand hover:underline">Review →</Link>}
        </div>

        <div className={`rounded-xl border bg-white p-4 shadow-sm ${pendingAtt > 0 ? "border-orange-300" : ""}`}>
          <div className="text-2xl font-bold text-orange-500">{pendingAtt}</div>
          <div className="text-sm text-gray-600">Unapproved attendance</div>
          {pendingAtt > 0 && <Link href="/manager/attendance" className="text-xs text-brand hover:underline">Approve →</Link>}
        </div>
      </div>

      {/* ── Fines ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Add fine form */}
        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold text-gray-800">Add Fine</h2>
          <form action={createFine} className="space-y-3 text-sm">
            <div>
              <label className="label">Employee</label>
              <select name="employeeId" required className="input">
                <option value="">Select…</option>
                {employees.map((e) => (
                  <option key={e.userId} value={e.userId}>{e.user.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Amount (MMK)</label>
              <input name="amount" type="number" min="1" required className="input" />
            </div>
            <div>
              <label className="label">Reason</label>
              <input name="reason" required className="input" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Deduct Month</label>
                <select name="deductMonth" className="input">
                  {MONTHS.map((m, i) => (
                    <option key={i} value={i + 1} selected={i === now.getMonth()}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Year</label>
                <input name="deductYear" type="number" className="input" defaultValue={now.getFullYear()} />
              </div>
            </div>
            <SubmitButton className="w-full rounded-lg bg-brand py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
              Add Fine
            </SubmitButton>
          </form>
        </div>

        {/* Recent fines */}
        <div className="lg:col-span-2 rounded-xl border bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700">
            Recent fines
          </div>
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left">Employee</th>
                <th className="px-4 py-2 text-left">Amount</th>
                <th className="px-4 py-2 text-left">Reason</th>
                <th className="px-4 py-2 text-left">Deduct</th>
                <th className="px-4 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {recentFines.map((f) => (
                <tr key={f.id}>
                  <td className="px-4 py-2 font-medium">{f.employee.user.name}</td>
                  <td className="px-4 py-2">{f.amount.toLocaleString()} MMK</td>
                  <td className="px-4 py-2 text-gray-500">{f.reason}</td>
                  <td className="px-4 py-2 text-gray-500">{MONTHS[f.deductMonth - 1]} {f.deductYear}</td>
                  <td className="px-4 py-2">
                    <span className={`badge ${f.deducted ? "badge-green" : "badge-gray"}`}>
                      {f.deducted ? "Deducted" : "Pending"}
                    </span>
                  </td>
                </tr>
              ))}
              {recentFines.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-400">No fines recorded.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
