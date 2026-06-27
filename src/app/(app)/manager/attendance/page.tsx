import Link from "next/link";
import { getLiveAttendanceStatus } from "@/lib/hr-attendance";
import LiveAttendance from "./LiveAttendance";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

export default async function AttendancePage() {
  const t = await getT();
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t("heading_live_attendance")}</h1>
        <Link href="/reports?tab=attendance"
          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark">
          {t("btn_end_of_day_review")}
        </Link>
      </div>
      <LiveAttendance entries={serialised} />
    </div>
  );
}
