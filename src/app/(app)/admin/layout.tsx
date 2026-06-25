import Link from "next/link";
import { requireAnyRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

const TABS = [
  { href: "/admin/tables", label: "Areas & Tables" },
  { href: "/admin/menu", label: "Menu & Settings" },
  { href: "/admin/flavours", label: "Soup Flavours" },
  { href: "/admin/categories", label: "Expense Categories" },
  { href: "/admin/users", label: "Users & Roles" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAnyRole(["ADMIN"]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 border-b border-gray-200 pb-2">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            {t.label}
          </Link>
        ))}
      </div>
      {children}
    </div>
  );
}
