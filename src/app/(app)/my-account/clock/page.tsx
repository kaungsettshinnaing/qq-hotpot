import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { clockIn, clockOut, breakOut, breakIn } from "./actions";

function fmt(d: Date | null) {
  if (!d) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

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
  });

  const onBreak = !!(att?.breakOutAt && !att.breakInAt);
  const clockedOut = !!att?.clockOutAt;
  const clockedIn = !!att?.clockInAt;

  return (
    <div className="flex flex-col items-center gap-6 py-8">
      <div className="text-center">
        <div className="text-4xl font-bold text-brand">{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
        <div className="text-gray-500">{new Date().toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
      </div>

      <div className="w-full max-w-sm rounded-xl border bg-white p-6 shadow-sm space-y-3 text-sm">
        <div className="flex justify-between"><span className="text-gray-500">Clock In</span><span className="font-medium">{fmt(att?.clockInAt ?? null)}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Break Out</span><span className="font-medium">{fmt(att?.breakOutAt ?? null)}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Break In</span><span className="font-medium">{fmt(att?.breakInAt ?? null)}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Clock Out</span><span className="font-medium">{fmt(att?.clockOutAt ?? null)}</span></div>
        <div className="border-t pt-3 flex justify-between">
          <span className="text-gray-500">Status</span>
          <span className={`font-semibold ${clockedOut ? "text-gray-400" : onBreak ? "text-yellow-600" : clockedIn ? "text-green-600" : "text-gray-400"}`}>
            {clockedOut ? "Clocked Out" : onBreak ? "On Break" : clockedIn ? "Working" : "Not Started"}
          </span>
        </div>
      </div>

      <div className="grid w-full max-w-sm gap-3">
        {!clockedIn && !clockedOut && (
          <form action={clockIn}>
            <button type="submit" className="w-full rounded-2xl bg-green-600 py-5 text-xl font-bold text-white hover:bg-green-700 active:scale-95 transition">
              ▶ Clock In
            </button>
          </form>
        )}
        {clockedIn && !clockedOut && !onBreak && (
          <form action={breakOut}>
            <button type="submit" className="w-full rounded-2xl bg-yellow-500 py-4 text-lg font-bold text-white hover:bg-yellow-600 active:scale-95 transition">
              ☕ Break Out
            </button>
          </form>
        )}
        {onBreak && (
          <form action={breakIn}>
            <button type="submit" className="w-full rounded-2xl bg-blue-600 py-4 text-lg font-bold text-white hover:bg-blue-700 active:scale-95 transition">
              ↩ Back from Break
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
  );
}
