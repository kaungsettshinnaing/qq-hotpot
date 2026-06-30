import { requireAnyRole } from "@/lib/auth";
import TabNav from "@/components/TabNav";

export const dynamic = "force-dynamic";

const TABS = [
  { href: "/manager",            label: "Dashboard" },
  { href: "/manager/attendance", label: "Live Attendance" },
  { href: "/manager/leave",      label: "Leave Requests" },
  { href: "/manager/inventory",  label: "Inventory" },
];

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  await requireAnyRole(["MANAGER", "ADMIN"]);
  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-white p-3 shadow-sm border border-gray-100">
        <TabNav tabs={TABS} />
      </div>
      {children}
    </div>
  );
}
