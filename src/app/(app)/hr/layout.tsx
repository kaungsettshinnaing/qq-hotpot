import { requireAnyRole } from "@/lib/auth";
import TabNav from "@/components/TabNav";

export const dynamic = "force-dynamic";

const TABS = [
  { href: "/hr",             label: "Dashboard" },
  { href: "/hr/employees",   label: "Employees" },
  { href: "/hr/attendance",  label: "Attendance" },
  { href: "/hr/leave",       label: "Leave" },
  { href: "/hr/payroll",     label: "Payroll" },
  { href: "/hr/advances",    label: "Advances" },
  { href: "/hr/fines",       label: "Fines" },
];

export default async function HRLayout({ children }: { children: React.ReactNode }) {
  await requireAnyRole(["HR", "ADMIN", "MANAGER"]);
  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-white p-3 shadow-sm border border-gray-100">
        <TabNav tabs={TABS} />
      </div>
      {children}
    </div>
  );
}
