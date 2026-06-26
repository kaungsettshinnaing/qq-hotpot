import { getLiveAttendanceStatus } from "@/lib/hr-attendance";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requireAnyRole } from "@/lib/auth";
import LiveAttendance from "./LiveAttendance";
import type { AttendanceStatus, DayType } from "@prisma/client";

// Bulk approve: reads status_<id> + dayType_<id> for every unapproved row
async function bulkReviewToday(fd: FormData) {
  "use server";
  const session = await requireAnyRole(["MANAGER", "ADMIN"]);
  const ops: Promise<unknown>[] = [];
  for (const [key, value] of fd.entries()) {
    if (!key.startsWith("status_")) continue;
    const id = key.slice(7);
    const status = value as AttendanceStatus;
    const dayType = ((fd.get(`dayType_${id}`) as string | null) ?? "FULL") as DayType;
    ops.push(
      prisma.attendance.update({
        where: { id },
        data: { status, dayType, isApproved: true, approvedById: session.id },
      })
    );
  }
  await Promise.all(ops);
  revalidatePath("/manager/attendance");
}

// Re-review a single already-approved record
async function reviewOne(fd: FormData) {
  "use server";
  const session = await requireAnyRole(["MANAGER", "ADMIN"]);
  const id = fd.get("id") as string;
  const status = fd.get("status") as AttendanceStatus;
  const dayType = (fd.get("dayType") as DayType) ?? "FULL";
  await prisma.attendance.update({
    where: { id },
    data: { status, dayType, isApproved: true, approvedById: session.id },
  });
  revalidatePath("/manager/attendance");
}

const STATUS_OPTS: AttendanceStatus[] = ["PRESENT", "OT", "ABSENT", "LEAVE", "REST_DAY"];
const STATUS_COLOR: Record<AttendanceStatus, string> = {
  PRESENT: "text-green-700",
  OT: "text-purple-700",
  ABSENT: "text-red-700",
  LEAVE: "text-blue-700",
  REST_DAY: "text-gray-400",
};

function fmt(d: Date | null) {
  if (!d) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default async function AttendancePage() {
  const live = await getLiveAttendanceStatus();

  const serialised = live.map((e) => ({
    employeeId: e.employeeId,
    name: e.name,
    status: e.status,
    clockInAt: e.attendance?.clockInAt?.toISOString() ?? null,
    clockOutAt: e.attendance?.clockOutAt?.toISOString() ?? null,
    breakCount: e.breakCount,
    currentBreakStartAt: e.openBreak?.startAt.toISOString() ?? null,
  }));

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayAttendances = await prisma.attendance.findMany({
    where: { date: today, status: { not: "REST_DAY" } },
    include: { employee: { include: { user: { select: { name: true } } } } },
    orderBy: { employee: { user: { name: "asc" } } },
  });

  const unapproved = todayAttendances.filter((a) => !a.isApproved);
  const approved = todayAttendances.filter((a) => a.isApproved);

  return (
    <div className="space-y-8">
      {/* Live board */}
      <div className="space-y-3">
        <h1 className="text-xl font-bold">Live Attendance — Today</h1>
        <LiveAttendance entries={serialised} />
      </div>

      {/* ── End of Day Review ── */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-gray-800">End of Day Review</h2>

        {todayAttendances.length === 0 && (
          <p className="text-sm text-gray-400">No attendance records yet today.</p>
        )}

        {/* Unapproved — one bulk form, per-row dropdowns, single submit */}
        {unapproved.length > 0 && (
          <form action={bulkReviewToday} className="space-y-2">
            <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Employee</th>
                    <th className="px-4 py-2 text-center font-medium">Clock In</th>
                    <th className="px-4 py-2 text-center font-medium">Clock Out</th>
                    <th className="px-4 py-2 text-center font-medium">Status</th>
                    <th className="px-4 py-2 text-center font-medium">Day</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {unapproved.map((a) => (
                    <tr key={a.id}>
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {a.employee.user.name}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600">{fmt(a.clockInAt)}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{fmt(a.clockOutAt)}</td>
                      <td className="px-4 py-3 text-center">
                        <select
                          name={`status_${a.id}`}
                          defaultValue={a.status}
                          className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
                        >
                          {STATUS_OPTS.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <select
                          name={`dayType_${a.id}`}
                          defaultValue={a.dayType}
                          className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
                        >
                          <option value="FULL">Full day</option>
                          <option value="HALF">Half day</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="rounded-xl bg-brand px-6 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
              >
                Approve All ({unapproved.length})
              </button>
            </div>
          </form>
        )}

        {/* Already approved — editable per row */}
        {approved.length > 0 && (
          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="border-b bg-green-50 px-4 py-2 text-xs font-semibold text-green-700">
              Approved today ({approved.length})
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {approved.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-2 font-medium text-gray-800 w-40">
                      {a.employee.user.name}
                    </td>
                    <td className="px-4 py-2 text-center text-gray-500 text-xs">{fmt(a.clockInAt)}</td>
                    <td className="px-4 py-2 text-center text-gray-500 text-xs">{fmt(a.clockOutAt)}</td>
                    <td className={`px-4 py-2 text-center text-xs font-semibold ${STATUS_COLOR[a.status]}`}>
                      {a.status}
                    </td>
                    <td className="px-4 py-2 text-center text-xs text-gray-500">
                      {a.dayType === "HALF" ? "½ day" : "Full"}
                    </td>
                    <td className="px-4 py-2">
                      <form action={reviewOne} className="flex items-center gap-1 justify-end">
                        <input type="hidden" name="id" value={a.id} />
                        <select name="status" defaultValue={a.status}
                          className="rounded border border-gray-200 px-1 py-0.5 text-xs">
                          {STATUS_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <select name="dayType" defaultValue={a.dayType}
                          className="rounded border border-gray-200 px-1 py-0.5 text-xs">
                          <option value="FULL">Full</option>
                          <option value="HALF">Half</option>
                        </select>
                        <button type="submit" className="text-xs text-brand hover:underline whitespace-nowrap">
                          Update
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
