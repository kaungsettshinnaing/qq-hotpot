import { requireAnyRole } from "@/lib/auth";
import TabNav from "@/components/TabNav";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  await requireAnyRole(["MANAGER", "ADMIN"]);
  const t = await getT();
  const TABS = [
    { href: "/manager",            label: t("tab_dashboard") },
    { href: "/manager/attendance", label: t("tab_live_attendance") },
    { href: "/manager/leave",      label: t("heading_leave_requests") },
    { href: "/manager/inventory",  label: t("nav_inventory") },
  ];
  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-white p-3 shadow-sm border border-gray-100">
        <TabNav tabs={TABS} />
      </div>
      {children}
    </div>
  );
}
