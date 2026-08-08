import { requireAnyRole } from "@/lib/auth";
import TabNav from "@/components/TabNav";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

export default async function HRLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAnyRole(["HR", "ADMIN", "MANAGER"]);
  const t = await getT();
  const ALL_TABS = [
    { href: "/hr",             label: t("tab_dashboard") },
    { href: "/hr/employees",   label: t("tab_employees") },
    { href: "/hr/attendance",  label: t("tab_attendance") },
    { href: "/hr/leave",       label: t("tab_leave") },
    { href: "/hr/payroll",     label: t("tab_payroll") },
    { href: "/hr/advances",    label: t("tab_advances") },
    { href: "/hr/fines",       label: t("tab_fines") },
  ];
  const MANAGER_TABS = [
    { href: "/hr/advances", label: t("tab_advances") },
    { href: "/hr/fines",    label: t("tab_fines") },
  ];
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
