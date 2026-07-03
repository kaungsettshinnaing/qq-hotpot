import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { markAttendance, approveAttendance } from "./actions";
import { mmNow, mmToday } from "@/lib/business-day";
import { getT } from "@/lib/lang";

const STATUSES = ["PRESENT", "ABSENT", "LEAVE", "REST_DAY", "OT"] as const;
const STATUS_COLOR: Record<string, string> = {
  PRESENT: "bg-green-100 text-green-700",
  ABSENT: "bg-red-100 text-red-700",
  LEAVE: "bg-blue-100 text-blue-700",
  REST_DAY: "bg-gray-100 text-gray-400",
  OT: "bg-purple-100 text-purple-700",
};

export default async function HRAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  await requireAnyRole(["HR", "ADMIN"]);
  const t = await getT();
  const nowMM = mmNow();
  const todayMM = mmToday();
  const sp = await searchParams;
  const month = parseInt(sp.month ?? String(nowMM.getUTCMonth() + 1));
  const year = parseInt(sp.year ?? String(nowMM.getUTCFullYear()));

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 1) - 1).getUTCDate();

  const [employees, pending] = await Promise.all([
    prisma.employee.findMany({
      where: { isActive: true, isSystem: false },
      include: {
        user: { select: { name: true } },
        attendances: { where: { date: { gte: start, lt: end } } },
      },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.attendance.findMany({
      where: { isApproved: false, status: { not: "REST_DAY" } },
      include: { employee: { include: { user: { select: { name: true } } } } },
      orderBy: { date: "desc" },
      take: 30,
    }),
  ]);

  const prev = month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year };
  const next = month === 12 ? { month: 1, year: year + 1 } : { month: month + 1, year };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-bold">{t("heading_attendance")}</h1>
        <div className="flex items-center gap-2 text-sm">
          <a href={`?month=${prev.month}&year=${prev.year}`} className="btn-outline px-2 py-1">‹</a>
          <span className="font-medium">
            {new Date(year, month - 1).toLocaleString("default", { month: "long", year: "numeric" })}
          </span>
          <a href={`?month=${next.month}&year=${next.year}`} className="btn-outline px-2 py-1">›</a>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold text-sm text-orange-600">⚠ {t("section_unapproved")} ({pending.length})</h2>
          <div className="rounded-xl border bg-orange-50 p-3 space-y-1">
            {pending.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-sm">
                <span>{a.employee.user.name} — {formatDate(a.date)} ({a.status})</span>
                <form action={approveAttendance}>
                  <input type="hidden" name="id" value={a.id} />
                  <button type="submit" className="text-xs text-brand hover:underline">{t("btn_approve_attendance")}</button>
                </form>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="min-w-full text-xs">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="sticky left-0 bg-gray-50 px-3 py-2 text-left text-xs font-semibold">{t("col_employee")}</th>
              {Array.from({ length: daysInMonth }, (_, i) => (
                <th key={i} className="px-1 py-2 text-center font-medium text-gray-400">{i + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {employees.map((emp) => {
              const attMap = new Map(emp.attendances.map((a) => [a.date.getUTCDate(), a]));
              return (
                <tr key={emp.userId}>
                  <td className="sticky left-0 bg-white px-3 py-1.5 font-medium whitespace-nowrap">{emp.user.name}</td>
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const day = i + 1;
                    const a = attMap.get(day);
                    const dow = new Date(year, month - 1, day).getDay();
                    const isRestDay = !a && emp.restDays.includes(dow);
                    return (
                      <td key={day} className="px-0.5 py-1 text-center">
                        {a ? (
                          <span className={`inline-block rounded px-1 py-0.5 text-[10px] font-medium ${STATUS_COLOR[a.status]}`}>
                            {a.status.slice(0, 2)}
                          </span>
                        ) : isRestDay ? (
                          <span className={`inline-block rounded px-1 py-0.5 text-[10px] font-medium ${STATUS_COLOR["REST_DAY"]}`}>
                            RE
                          </span>
                        ) : (
                          <span className="text-gray-200">·</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-semibold text-sm">{t("section_mark_attendance")}</h2>
        <form action={markAttendance} className="grid gap-3 sm:grid-cols-5">
          <select name="employeeId" required className="input">
            <option value="">{t("label_employee")}…</option>
            {employees.map((e) => <option key={e.userId} value={e.userId}>{e.user.name}</option>)}
          </select>
          <input name="date" type="date" required className="input"
            defaultValue={todayMM} />
          <select name="status" className="input">
            <option value="">— Clear —</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input name="note" className="input" placeholder={`${t("col_note")} (optional)`} />
          <button type="submit" className="btn-brand">{t("btn_mark_attendance")}</button>
        </form>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {Object.entries(STATUS_COLOR).map(([s, cls]) => (
          <span key={s} className={`rounded px-2 py-0.5 ${cls}`}>{s}</span>
        ))}
      </div>
    </div>
  );
}
