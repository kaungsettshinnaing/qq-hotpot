"use client";

import { useRoomRefresh } from "@/lib/socket-client";

type StatusEntry = {
  employeeId: string;
  name: string;
  status: "not_started" | "working" | "on_break" | "clocked_out";
  clockInAt: string | null;
  breakOutAt: string | null;
  breakInAt: string | null;
  clockOutAt: string | null;
};

const STATUS_LABEL: Record<StatusEntry["status"], string> = {
  not_started: "Not started",
  working: "Working",
  on_break: "On break",
  clocked_out: "Clocked out",
};

const STATUS_COLOR: Record<StatusEntry["status"], string> = {
  not_started: "bg-gray-100 text-gray-500",
  working: "bg-green-100 text-green-700",
  on_break: "bg-yellow-100 text-yellow-700",
  clocked_out: "bg-gray-200 text-gray-500",
};

function fmt(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function LiveAttendance({ entries }: { entries: StatusEntry[] }) {
  useRoomRefresh("hr", ["attendance:update", "break:out", "break:in"]);

  return (
    <div className="rounded-xl border bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
          <tr>
            <th className="px-4 py-2">Employee</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2">Clock In</th>
            <th className="px-4 py-2">Break Out</th>
            <th className="px-4 py-2">Break In</th>
            <th className="px-4 py-2">Clock Out</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {entries.map((e) => (
            <tr key={e.employeeId}>
              <td className="px-4 py-2 font-medium">{e.name}</td>
              <td className="px-4 py-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[e.status]}`}>
                  {STATUS_LABEL[e.status]}
                </span>
              </td>
              <td className="px-4 py-2">{fmt(e.clockInAt)}</td>
              <td className="px-4 py-2">{fmt(e.breakOutAt)}</td>
              <td className="px-4 py-2">{fmt(e.breakInAt)}</td>
              <td className="px-4 py-2">{fmt(e.clockOutAt)}</td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No active employees</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
