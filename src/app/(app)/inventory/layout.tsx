import { requireAnyRole } from "@/lib/auth";
import TabNav from "@/components/TabNav";

export const dynamic = "force-dynamic";

const TABS = [
  { href: "/inventory",              label: "Stock Levels" },
  { href: "/inventory/deliveries",   label: "Deliveries" },
  { href: "/inventory/usage",        label: "Usage" },
  { href: "/inventory/reports",      label: "Reports" },
];

export default async function InventoryLayout({ children }: { children: React.ReactNode }) {
  await requireAnyRole(["CASHIER", "WAITER", "KITCHEN", "MANAGER", "ADMIN"]);
  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-white p-3 shadow-sm border border-gray-100">
        <TabNav tabs={TABS} />
      </div>
      {children}
    </div>
  );
}
