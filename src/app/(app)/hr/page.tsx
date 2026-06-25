import { prisma } from "@/lib/db";

export default async function HRDashboard() {
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

  const cards = [
    { label: "Total Employees", value: total, sub: `${active} active` },
    { label: "Pending Leave Requests", value: pendingLeave, urgent: pendingLeave > 0 },
    { label: "Unapproved Attendance", value: pendingAttendance, urgent: pendingAttendance > 0 },
    {
      label: `${now.toLocaleString("default", { month: "long" })} Payroll`,
      value: payroll ? payroll.status : "Not generated",
      sub: payroll?.status === "LOCKED" ? "Locked" : "Draft / pending",
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">HR Overview</h1>
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
