import Link from "next/link";
import { requireAnyRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

const TABS = [
  { href: "/manager", label: "Dashboard" },
  { href: "/manager/attendance", label: "Live Attendance" },
  { href: "/manager/leave", label: "Leave Requests" },
];

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  await requireAnyRole(["MANAGER", "ADMIN"]);
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
