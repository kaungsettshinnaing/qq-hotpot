import Link from "next/link";
import { requireAnyRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

const TABS = [
  { href: "/hr", label: "Dashboard" },
  { href: "/hr/employees", label: "Employees" },
  { href: "/hr/attendance", label: "Attendance" },
  { href: "/hr/leave", label: "Leave" },
  { href: "/hr/payroll", label: "Payroll" },
  { href: "/hr/advances", label: "Advances" },
  { href: "/hr/fines", label: "Fines" },
];

export default async function HRLayout({ children }: { children: React.ReactNode }) {
  await requireAnyRole(["HR", "ADMIN"]);
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
