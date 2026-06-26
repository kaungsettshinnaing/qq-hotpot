import Link from "next/link";
import { requireAnyRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

const TABS = [
  { href: "/inventory",          label: "Stock Levels" },
  { href: "/inventory/deliveries", label: "Deliveries" },
  { href: "/inventory/usage",    label: "Usage" },
  { href: "/inventory/reports",  label: "Reports" },
];

export default async function InventoryLayout({ children }: { children: React.ReactNode }) {
  await requireAnyRole(["CASHIER", "WAITER", "KITCHEN", "MANAGER", "ADMIN"]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 border-b border-gray-200 pb-2">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100">
            {t.label}
          </Link>
        ))}
      </div>
      {children}
    </div>
  );
}
