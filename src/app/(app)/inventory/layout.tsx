import { requireAnyRole } from "@/lib/auth";
import TabNav from "@/components/TabNav";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

export default async function InventoryLayout({ children }: { children: React.ReactNode }) {
  await requireAnyRole(["CASHIER", "WAITER", "KITCHEN", "MANAGER", "ADMIN"]);
  const t = await getT();
  const TABS = [
    { href: "/inventory",              label: t("tab_stock_levels") },
    { href: "/inventory/deliveries",   label: t("tab_deliveries") },
    { href: "/inventory/usage",        label: t("tab_usage") },
    { href: "/inventory/reports",      label: t("tab_reports") },
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
