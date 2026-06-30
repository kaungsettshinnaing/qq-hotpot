import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { clockIn, breakOut, breakIn } from "./actions";
import LiveClock from "./LiveClock";
import LiveDuration from "./LiveDuration";
import ClockOutButton from "./ClockOutButton";
import { getT } from "@/lib/lang";

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
  const t = await getT();

  const emp = await prisma.employee.findUnique({ where: { userId: session.id } });

  if (!emp) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-gray-500">{t("no_employee_profile")}</p>
      </div>
    );
  }

  const MM_OFFSET_MS = (6 * 60 + 30) * 60 * 1000;
  const mmNow = new Date(Date.now() + MM_OFFSET_MS);
  const today = new Date(Date.UTC(mmNow.getUTCFullYear(), mmNow.getUTCMonth(), mmNow.getUTCDate()));
  const att = await prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId: emp.userId, date: today } },
    include: { breaks: { orderBy: { startAt: "asc" } } },
  });

  const openBreak = att?.breaks.find((b) => !b.endAt) ?? null;
  const onBreak = !!openBreak;
  const clockedIn = !!att?.clockInAt;
  const clockedOut = !!att?.clockOutAt;

  const statusText = clockedOut ? t("status_clocked_out")
    : onBreak ? t("status_on_break")
    : clockedIn ? t("status_working")
    : t("status_not_started");

  return (
    <div className="flex flex-col items-center gap-6 py-8">
      <div className="w-full max-w-sm rounded-xl bg-brand-dark/5 border border-brand-dark/10 px-4 py-2.5 text-center">
        <p className="text-xs text-gray-500">{t("label_logged_in_as")}</p>
        <p className="text-base font-bold text-gray-900">{session.name}</p>
      </div>

      <div className="text-center">
        <LiveClock dateStr={formatDate(new Date())} />
      </div>

      <div className="w-full max-w-sm space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t("section_shift")}</h2>
        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">{t("label_clock_in")}</span>
            <span className="font-medium">{fmt(att?.clockInAt)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{t("label_clock_out")}</span>
            <span className="font-medium">{fmt(att?.clockOutAt)}</span>
          </div>
          <div className="border-t pt-2 flex justify-between">
            <span className="text-gray-500">{t("label_status")}</span>
            <span className={`font-semibold ${
              clockedOut ? "text-gray-400" : onBreak ? "text-yellow-600" : clockedIn ? "text-green-600" : "text-gray-400"
            }`}>
              {statusText}
            </span>
          </div>
        </div>

        <div className="grid gap-2">
          {!clockedIn && !clockedOut && (
            <form action={clockIn}>
              <button type="submit" className="w-full rounded-2xl bg-green-600 py-5 text-xl font-bold text-white hover:bg-green-700 active:scale-95 transition">
                {t("btn_clock_in")}
              </button>
            </form>
          )}
          {clockedIn && !clockedOut && (
            <ClockOutButton
              labelClockOut={t("btn_clock_out")}
              labelConfirm={t("confirm_clock_out")}
              labelCancel={t("btn_cancel")}
              labelYes={t("btn_yes_clock_out")}
            />
          )}
          {clockedOut && (
            <div className="rounded-2xl bg-gray-100 py-5 text-center text-lg font-semibold text-gray-400">
              {t("status_day_complete")}
            </div>
          )}
        </div>
      </div>

      {att?.clockOutAt && (
        <p className="text-xs text-gray-400 max-w-sm text-center">{t("label_accidental_clock_out")}</p>
      )}

      {clockedIn && (
        <div className="w-full max-w-sm space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t("section_breaks")}</h2>

          {(att?.breaks.length ?? 0) > 0 && (
            <div className="rounded-xl border bg-white p-4 shadow-sm space-y-1 text-sm">
              {att!.breaks.map((b, i) => (
                <div key={b.id} className="flex items-center justify-between">
                  <span className="text-gray-500">
                    Break {i + 1} &nbsp;
                    <span className="font-medium text-gray-700">{fmt(b.startAt)}</span>
                    {" → "}
                    <span className="font-medium text-gray-700">{b.endAt ? fmt(b.endAt) : t("status_on_break").toLowerCase()}</span>
                  </span>
                  <span className={`text-xs font-semibold ${b.endAt ? "text-gray-400" : "text-yellow-600"}`}>
                    {b.endAt
                      ? `${durationMins(b.startAt, b.endAt)} min`
                      : <LiveDuration startAt={b.startAt.toISOString()} />}
                  </span>
                </div>
              ))}
            </div>
          )}

          {!clockedOut && (
            <div className="grid gap-2">
              {!onBreak && (
                <form action={breakOut}>
                  <button type="submit" className="w-full rounded-2xl bg-yellow-500 py-4 text-lg font-bold text-white hover:bg-yellow-600 active:scale-95 transition">
                    {t("btn_break_start")}
                  </button>
                </form>
              )}
              {onBreak && (
                <form action={breakIn}>
                  <button type="submit" className="w-full rounded-2xl bg-blue-600 py-4 text-lg font-bold text-white hover:bg-blue-700 active:scale-95 transition">
                    {t("btn_break_end")}
                  </button>
                </form>
              )}
            </div>
          )}

          {(att?.breaks.length ?? 0) === 0 && !onBreak && (
            <p className="text-center text-xs text-gray-400">{t("empty_no_breaks")}</p>
          )}
        </div>
      )}
    </div>
  );
}
