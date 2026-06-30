import { requireAnyRole } from "@/lib/auth";
import TabNav from "@/components/TabNav";

export const dynamic = "force-dynamic";

const ALL_TABS = [
  { href: "/hr",             label: "Dashboard" },
  { href: "/hr/employees",   label: "Employees" },
  { href: "/hr/attendance",  label: "Attendance" },
  { href: "/hr/leave",       label: "Leave" },
  { href: "/hr/payroll",     label: "Payroll" },
  { href: "/hr/advances",    label: "Advances" },
  { href: "/hr/fines",       label: "Fines" },
];

const MANAGER_TABS = [
  { href: "/hr/advances", label: "Advances" },
  { href: "/hr/fines",    label: "Fines" },
];

export default async function HRLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAnyRole(["HR", "ADMIN", "MANAGER"]);
  const managerOnly = user.roles.includes("MANAGER") && !user.roles.some((r) => r === "HR" || r === "ADMIN");
  const tabs = managerOnly ? MANAGER_TABS : ALL_TABS;
  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-white p-3 shadow-sm border border-gray-100">
        <TabNav tabs={tabs} />
      </div>
      {children}
    </div>
  );
}
