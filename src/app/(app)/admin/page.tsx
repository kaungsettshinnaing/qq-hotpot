import Link from "next/link";

export const dynamic = "force-dynamic";

const CARDS = [
  { href: "/admin/tables", icon: "🪑", label: "Areas & Tables", desc: "Add areas and tables (e.g. A1)" },
  { href: "/admin/menu", icon: "🍽️", label: "Menu & Settings", desc: "Prices, free-pot rule, tax/service" },
  { href: "/admin/flavours", icon: "🥣", label: "Soup Flavours", desc: "Hotpot / BBQ flavours" },
  { href: "/admin/categories", icon: "🏷️", label: "Expense Categories", desc: "For the expense module" },
  { href: "/admin/users", icon: "👥", label: "Users & Roles", desc: "Staff logins and permissions" },
];

export default function AdminHome() {
  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Admin</h1>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-brand hover:shadow"
          >
            <div className="text-3xl">{c.icon}</div>
            <div className="mt-2 font-semibold text-gray-800">{c.label}</div>
            <div className="text-sm text-gray-500">{c.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
