"use client";

import { useRoomRefresh } from "@/lib/socket-client";

type LiveStatus = "not_started" | "working" | "on_break" | "clocked_out" | "on_leave" | "rest";

type StatusEntry = {
  employeeId: string;
  name: string;
  status: LiveStatus;
  clockInAt: string | null;
  clockOutAt: string | null;
  breakCount: number;
  totalBreakMins: number;
  currentBreakStartAt: string | null;
  isRestDay: boolean;
};

const STATUS_LABEL: Record<LiveStatus, string> = {
  not_started: "Not started",
  working: "Working",
  on_break: "On break",
  clocked_out: "Clocked out",
  on_leave: "On leave",
  rest: "Rest day",
};

const STATUS_COLOR: Record<LiveStatus, string> = {
  not_started: "bg-gray-100 text-gray-500",
  working: "bg-green-100 text-green-700",
  on_break: "bg-yellow-100 text-yellow-700",
  clocked_out: "bg-gray-200 text-gray-600",
  on_leave: "bg-blue-100 text-blue-700",
  rest: "bg-violet-100 text-violet-600",
};

const STATUS_ORDER: Record<LiveStatus, number> = {
  working: 0,
  on_break: 1,
  on_leave: 2,
  rest: 3,
  not_started: 4,
  clocked_out: 5,
};

function fmtTime(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtMins(mins: number) {
  if (mins <= 0) return null;
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function fmtBreakSummary(count: number, mins: number) {
  const countStr = count === 1 ? "1 break" : `${count} breaks`;
  const timeStr = fmtMins(mins);
  return timeStr ? `${countStr}; ${timeStr} total` : countStr;
}

export default function LiveAttendance({ entries }: { entries: StatusEntry[] }) {
  useRoomRefresh("hr", ["attendance:update", "break:out", "break:in"]);

  const sorted = [...entries].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name),
  );

  if (sorted.length === 0) {
    return <p className="py-6 text-center text-sm text-gray-400">No active employees</p>;
  }

  return (
    <div className="space-y-3">
      {/* ── Mobile cards (< sm) ── */}
      <div className="grid grid-cols-1 gap-2 sm:hidden">
        {sorted.map((e) => (
          <div
            key={e.employeeId}
            className={
              "rounded-xl border bg-white p-3 shadow-sm " +
              (e.status === "on_leave" ? "border-blue-200" : e.status === "rest" ? "border-violet-200" : "border-gray-100")
            }
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-gray-800">{e.name}</span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_COLOR[e.status]}`}>
                {STATUS_LABEL[e.status]}
              </span>
            </div>
            {e.status !== "rest" && e.status !== "on_leave" && (
              <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-gray-500">
                <span>In: <span className="font-medium text-gray-700">{fmtTime(e.clockInAt)}</span></span>
                <span>Out: <span className="font-medium text-gray-700">{fmtTime(e.clockOutAt)}</span></span>
                {e.breakCount > 0 ? (
                  <span className={e.currentBreakStartAt ? "text-yellow-700 font-medium" : "text-gray-500"}>
                    {e.currentBreakStartAt
                      ? `Break since ${fmtTime(e.currentBreakStartAt)} · ${fmtBreakSummary(e.breakCount, e.totalBreakMins)}`
                      : fmtBreakSummary(e.breakCount, e.totalBreakMins)}
                  </span>
                ) : null}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Desktop table (sm+) ── */}
      <div className="hidden sm:block rounded-xl border bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Employee</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Clock In</th>
              <th className="px-4 py-2">Break time</th>
              <th className="px-4 py-2">Clock Out</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sorted.map((e) => (
              <tr
                key={e.employeeId}
                className={
                  e.status === "on_leave" ? "bg-blue-50/40" :
                  e.status === "rest" ? "bg-violet-50/30" : ""
                }
              >
                <td className="px-4 py-2.5 font-medium text-gray-800">{e.name}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_COLOR[e.status]}`}>
                    {STATUS_LABEL[e.status]}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-600">{fmtTime(e.clockInAt)}</td>
                <td className="px-4 py-2.5 text-xs">
                  {e.breakCount > 0 ? (
                    <span className={e.currentBreakStartAt ? "font-medium text-yellow-700" : "text-gray-600"}>
                      {e.currentBreakStartAt && `Since ${fmtTime(e.currentBreakStartAt)} · `}
                      {fmtBreakSummary(e.breakCount, e.totalBreakMins)}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-gray-600">{fmtTime(e.clockOutAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-600">
        <div className="mb-1.5 font-semibold text-gray-700">End-of-day review statuses:</div>
        <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
          <div><span className="font-semibold text-green-700">PRESENT</span> — worked a normal shift, counts toward monthly working days</div>
          <div><span className="font-semibold text-purple-700">OT</span> — worked an extra day beyond required days — earns OT premium</div>
          <div><span className="font-semibold text-red-700">ABSENT</span> — did not come in — daily rate deducted</div>
          <div><span className="font-semibold text-blue-700">LEAVE</span> — on approved leave — daily rate deducted (same as absent)</div>
          <div><span className="font-semibold text-gray-500">REST DAY</span> — scheduled off, excluded from working-day count</div>
        </div>
      </div>
    </div>
  );
}
