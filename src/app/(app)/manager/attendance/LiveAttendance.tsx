"use client";

import { useRoomRefresh } from "@/lib/socket-client";

type LiveStatus = "not_started" | "working" | "on_break" | "clocked_out" | "on_leave";

type StatusEntry = {
  employeeId: string;
  name: string;
  status: LiveStatus;
  clockInAt: string | null;
  clockOutAt: string | null;
  breakCount: number;
  totalBreakMins: number;
  currentBreakStartAt: string | null;
};

const STATUS_LABEL: Record<LiveStatus, string> = {
  not_started: "Not started",
  working: "Working",
  on_break: "On break",
  clocked_out: "Clocked out",
  on_leave: "On leave",
};

const STATUS_COLOR: Record<LiveStatus, string> = {
  not_started: "bg-gray-100 text-gray-500",
  working: "bg-green-100 text-green-700",
  on_break: "bg-yellow-100 text-yellow-700",
  clocked_out: "bg-gray-200 text-gray-500",
  on_leave: "bg-blue-100 text-blue-700",
};

const STATUS_ORDER: Record<LiveStatus, number> = {
  working: 0,
  on_break: 1,
  on_leave: 2,
  not_started: 3,
  clocked_out: 4,
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

export default function LiveAttendance({ entries }: { entries: StatusEntry[] }) {
  useRoomRefresh("hr", ["attendance:update", "break:out", "break:in"]);

  const sorted = [...entries].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name),
  );

  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
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
              <tr key={e.employeeId} className={e.status === "on_leave" ? "bg-blue-50/40" : ""}>
                <td className="px-4 py-2 font-medium">{e.name}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[e.status]}`}>
                    {STATUS_LABEL[e.status]}
                  </span>
                </td>
                <td className="px-4 py-2 text-gray-600">{fmtTime(e.clockInAt)}</td>
                <td className="px-4 py-2 text-xs">
                  {e.currentBreakStartAt ? (
                    <span className="font-medium text-yellow-700">
                      Since {fmtTime(e.currentBreakStartAt)}
                      {fmtMins(e.totalBreakMins) && (
                        <span className="ml-1 text-yellow-600/80">· {fmtMins(e.totalBreakMins)} total</span>
                      )}
                    </span>
                  ) : fmtMins(e.totalBreakMins) ? (
                    <span className="text-gray-600">{fmtMins(e.totalBreakMins)}</span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-4 py-2 text-gray-600">{fmtTime(e.clockOutAt)}</td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">No active employees</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Status legend */}
      <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-600 space-y-1">
        <div className="font-semibold text-gray-700 mb-1">End-of-day review statuses (set by manager):</div>
        <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
          <div><span className="font-semibold text-green-700">PRESENT / OT</span> — clocked in, worked a normal or overtime shift</div>
          <div><span className="font-semibold text-blue-700">LEAVE</span> — on an approved leave request (annual, sick, etc.) — typically paid</div>
          <div><span className="font-semibold text-red-700">ABSENT</span> — did not come in with no approved leave — salary may be deducted</div>
          <div><span className="font-semibold text-gray-500">REST DAY</span> — scheduled day off, excluded from attendance counts</div>
        </div>
      </div>
    </div>
  );
}
