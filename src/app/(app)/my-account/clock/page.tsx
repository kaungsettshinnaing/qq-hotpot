import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { clockIn, clockOut, breakOut, breakIn } from "./actions";

function fmt(d: Date | null | undefined) {
  if (!d) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function durationMins(start: Date, end: Date | null | undefined) {
  const to = end ?? new Date();
  return Math.round((to.getTime() - start.getTime()) / 60000);
}

export const dynamic = "force-dynamic";

export default async function ClockPage() {
  const session = await requireSession();
  const emp = await prisma.employee.findUnique({ where: { userId: session.id } });

  if (!emp) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-gray-500">No employee profile linked to your account. Contact HR.</p>
      </div>
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const att = await prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId: emp.userId, date: today } },
    include: { breaks: { orderBy: { startAt: "asc" } } },
  });

  const openBreak = att?.breaks.find((b) => !b.endAt) ?? null;
  const onBreak = !!openBreak;
  const clockedIn = !!att?.clockInAt;
  const clockedOut = !!att?.clockOutAt;

  return (
    <div className="flex flex-col items-center gap-6 py-8">
      {/* Clock display */}
      <div className="text-center">
        <div className="text-4xl font-bold text-brand">
          {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
        <div className="text-gray-500">
          {formatDate(new Date())}
        </div>
      </div>

      {/* ── Section 1: Shift ── */}
      <div className="w-full max-w-sm space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Shift</h2>
        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Clock In</span>
            <span className="font-medium">{fmt(att?.clockInAt)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Clock Out</span>
            <span className="font-medium">{fmt(att?.clockOutAt)}</span>
          </div>
          <div className="border-t pt-2 flex justify-between">
            <span className="text-gray-500">Status</span>
            <span className={`font-semibold ${
              clockedOut ? "text-gray-400"
              : onBreak ? "text-yellow-600"
              : clockedIn ? "text-green-600"
              : "text-gray-400"
            }`}>
              {clockedOut ? "Clocked Out" : onBreak ? "On Break" : clockedIn ? "Working" : "Not Started"}
            </span>
          </div>
        </div>

        <div className="grid gap-2">
          {!clockedIn && !clockedOut && (
            <form action={clockIn}>
              <button type="submit" className="w-full rounded-2xl bg-green-600 py-5 text-xl font-bold text-white hover:bg-green-700 active:scale-95 transition">
                ▶ Clock In
              </button>
            </form>
          )}
          {clockedIn && !clockedOut && (
            <form action={clockOut}>
              <button type="submit" className="w-full rounded-2xl bg-red-700 py-4 text-lg font-bold text-white hover:bg-red-800 active:scale-95 transition">
                ■ Clock Out
              </button>
            </form>
          )}
          {clockedOut && (
            <div className="rounded-2xl bg-gray-100 py-5 text-center text-lg font-semibold text-gray-400">
              Day complete ✓
            </div>
          )}
        </div>
      </div>

      {/* ── Section 2: Breaks ── */}
      {clockedIn && (
        <div className="w-full max-w-sm space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Breaks</h2>

          {/* Break history */}
          {(att?.breaks.length ?? 0) > 0 && (
            <div className="rounded-xl border bg-white p-4 shadow-sm space-y-1 text-sm">
              {att!.breaks.map((b, i) => {
                const mins = durationMins(b.startAt, b.endAt);
                return (
                  <div key={b.id} className="flex items-center justify-between">
                    <span className="text-gray-500">
                      Break {i + 1} &nbsp;
                      <span className="font-medium text-gray-700">{fmt(b.startAt)}</span>
                      {" → "}
                      <span className="font-medium text-gray-700">{b.endAt ? fmt(b.endAt) : "ongoing"}</span>
                    </span>
                    <span className={`text-xs font-semibold ${b.endAt ? "text-gray-400" : "text-yellow-600"}`}>
                      {mins} min
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Break actions */}
          {!clockedOut && (
            <div className="grid gap-2">
              {!onBreak && (
                <form action={breakOut}>
                  <button type="submit" className="w-full rounded-2xl bg-yellow-500 py-4 text-lg font-bold text-white hover:bg-yellow-600 active:scale-95 transition">
                    ☕ Break Start
                  </button>
                </form>
              )}
              {onBreak && (
                <form action={breakIn}>
                  <button type="submit" className="w-full rounded-2xl bg-blue-600 py-4 text-lg font-bold text-white hover:bg-blue-700 active:scale-95 transition">
                    ↩ Break End
                  </button>
                </form>
              )}
            </div>
          )}

          {(att?.breaks.length ?? 0) === 0 && !onBreak && (
            <p className="text-center text-xs text-gray-400">No breaks recorded yet</p>
          )}
        </div>
      )}
    </div>
  );
}
