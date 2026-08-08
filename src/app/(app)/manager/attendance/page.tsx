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
      <LiveAttendance
        entries={serialised}
        labels={{
          statusNotStarted: t("status_not_started"),
          statusWorking: t("status_working"),
          statusOnBreak: t("status_on_break"),
          statusClockedOut: t("status_clocked_out"),
          statusOnLeave: t("status_on_leave"),
          statusRestDay: t("status_rest_day"),
          noActiveEmployees: t("empty_no_active_employees"),
          colEmployee: t("col_employee"),
          colStatus: t("col_status"),
          colClockIn: t("col_clock_in"),
          colBreakTime: t("col_break_time"),
          colClockOut: t("col_clock_out"),
          clockInPrefix: t("attendance_clock_in"),
          clockOutPrefix: t("attendance_clock_out"),
          breakSinceTemplate: t("label_break_since"),
          sinceTimeTemplate: t("label_since_time"),
          breakCountTemplate: t("label_break_count"),
          totalSuffix: t("label_total_suffix"),
          eodReviewHeading: t("heading_eod_review_statuses"),
          legendPresent: t("legend_desc_present"),
          legendOt: t("legend_desc_ot"),
          legendAbsent: t("legend_desc_absent"),
          legendLeave: t("legend_desc_leave"),
          legendRestDay: t("legend_desc_rest_day"),
          legendKeyPresent: t("legend_key_present"),
          legendKeyOt: t("legend_key_ot"),
          legendKeyAbsent: t("legend_key_absent"),
          legendKeyLeave: t("legend_key_leave"),
          legendKeyRestDay: t("legend_key_rest_day"),
        }}
      />
    </div>
  );
}
