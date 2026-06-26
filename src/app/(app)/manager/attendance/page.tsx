import { getLiveAttendanceStatus } from "@/lib/hr-attendance";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requireAnyRole } from "@/lib/auth";
import LiveAttendance from "./LiveAttendance";
import type { AttendanceStatus, DayType } from "@prisma/client";

async function reviewOne(fd: FormData) {
  "use server";
  const session = await requireAnyRole(["MANAGER", "ADMIN"]);
  const id = fd.get("id") as string;
  const status = fd.get("status") as AttendanceStatus;
  const dayType = ((fd.get("dayType") as string | null) ?? "FULL") as DayType;
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

const STATUS_BG: Record<AttendanceStatus, string> = {
  PRESENT: "bg-green-100 text-green-800",
  OT: "bg-purple-100 text-purple-800",
  ABSENT: "bg-red-100 text-red-700",
  LEAVE: "bg-blue-100 text-blue-700",
  REST_DAY: "bg-gray-100 text-gray-500",
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
    isRestDay: e.isRestDay,
    clockInAt: e.attendance?.clockInAt?.toISOString() ?? null,
    clockOutAt: e.attendance?.clockOutAt?.toISOString() ?? null,
    breakCount: e.breakCount,
    totalBreakMins: e.totalBreakMins,
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
      {/* ── Live board ── */}
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

        {/* Unapproved — individual form per row */}
        {unapproved.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Pending approval ({unapproved.length})
            </p>
            {unapproved.map((a) => (
              <form
                key={a.id}
                action={reviewOne}
                className="rounded-xl border border-orange-200 bg-white p-4 shadow-sm"
              >
                <input type="hidden" name="id" value={a.id} />

                {/* Name + times */}
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-gray-800">{a.employee.user.name}</div>
                    <div className="mt-0.5 text-xs text-gray-500">
                      In: {fmt(a.clockInAt)} &nbsp;·&nbsp; Out: {fmt(a.clockOutAt)}
                    </div>
                  </div>
                  <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-600">
                    Pending
                  </span>
                </div>

                {/* Controls */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="text-xs font-medium text-gray-500">Status</label>
                  <select
                    name="status"
                    defaultValue={a.status}
                    className="rounded-lg border border-gray-300 px-2 py-2 text-sm flex-1 min-w-[110px]"
                  >
                    {STATUS_OPTS.map((s) => (
                      <option key={s} value={s}>{s.replace("_", " ")}</option>
                    ))}
                  </select>
                  <select
                    name="dayType"
                    defaultValue={a.dayType}
                    className="rounded-lg border border-gray-300 px-2 py-2 text-sm"
                  >
                    <option value="FULL">Full day</option>
                    <option value="HALF">Half day</option>
                  </select>
                  <button
                    type="submit"
                    className="rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-dark active:scale-95 transition"
                  >
                    Approve
                  </button>
                </div>
              </form>
            ))}
          </div>
        )}

        {/* Approved — individual update per card */}
        {approved.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Approved ({approved.length})
            </p>
            {approved.map((a) => (
              <form
                key={a.id}
                action={reviewOne}
                className="rounded-xl border border-green-100 bg-green-50/40 p-3.5 shadow-sm"
              >
                <input type="hidden" name="id" value={a.id} />

                <div className="flex flex-wrap items-center justify-between gap-2">
                  {/* Name + current status */}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-800">{a.employee.user.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_BG[a.status]}`}>
                        {a.status.replace("_", " ")}
                      </span>
                      <span className="text-[11px] text-gray-400">
                        {a.dayType === "HALF" ? "½ day" : "Full"}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-gray-400">
                      In: {fmt(a.clockInAt)} &nbsp;·&nbsp; Out: {fmt(a.clockOutAt)}
                    </div>
                  </div>

                  {/* Edit controls */}
                  <div className="flex items-center gap-1.5">
                    <select
                      name="status"
                      defaultValue={a.status}
                      className="rounded-lg border border-gray-200 px-1.5 py-1.5 text-xs"
                    >
                      {STATUS_OPTS.map((s) => (
                        <option key={s} value={s}>{s.replace("_", " ")}</option>
                      ))}
                    </select>
                    <select
                      name="dayType"
                      defaultValue={a.dayType}
                      className="rounded-lg border border-gray-200 px-1.5 py-1.5 text-xs"
                    >
                      <option value="FULL">Full</option>
                      <option value="HALF">Half</option>
                    </select>
                    <button
                      type="submit"
                      className="rounded-lg bg-gray-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 active:scale-95 transition"
                    >
                      Update
                    </button>
                  </div>
                </div>
              </form>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
