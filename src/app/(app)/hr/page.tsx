import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/lang";

export default async function HRDashboard() {
  const session = await getSession();
  if (session && session.roles.includes("MANAGER") && !session.roles.some((r) => r === "HR" || r === "ADMIN")) {
    redirect("/hr/advances");
  }
  const t = await getT();
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const [total, active, pendingLeave, pendingAttendance, payroll] = await Promise.all([
    prisma.employee.count(),
    prisma.employee.count({ where: { isActive: true } }),
    prisma.leaveRequest.count({ where: { status: "PENDING" } }),
    prisma.attendance.count({ where: { isApproved: false, status: { not: "REST_DAY" } } }),
    prisma.payroll.findUnique({ where: { month_year: { month, year } } }),
  ]);

  const monthName = now.toLocaleString("default", { month: "long" });
  const payrollValue = payroll
    ? payroll.status === "LOCKED" ? t("payroll_locked") : t("payroll_draft")
    : t("payroll_not_generated");
  const payrollSub = payroll?.status === "LOCKED" ? t("payroll_locked") : t("payroll_draft");

  const cards = [
    { label: t("card_total_employees"), value: total, sub: `${active} ${t("card_active_suffix")}` },
    { label: t("card_pending_leave_hr"), value: pendingLeave, urgent: pendingLeave > 0 },
    { label: t("card_unapproved_att_hr"), value: pendingAttendance, urgent: pendingAttendance > 0 },
    { label: `${monthName} ${t("heading_payroll")}`, value: payrollValue, sub: payrollSub },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">{t("heading_hr_overview")}</h1>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label}
            className={`rounded-xl border bg-white p-4 shadow-sm ${(c as any).urgent ? "border-red-300" : ""}`}>
            <div className="text-2xl font-bold text-brand">{c.value}</div>
            <div className="mt-1 text-sm font-medium text-gray-700">{c.label}</div>
            {c.sub && <div className="text-xs text-gray-400">{c.sub}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
