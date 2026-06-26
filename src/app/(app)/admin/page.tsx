import Link from "next/link";

export const dynamic = "force-dynamic";

const CARDS = [
  {
    href: "/admin/tables",
    icon: "🪑",
    label: "Areas & Tables",
    desc: "Add areas and tables (e.g. A1)",
    color: "hover:border-amber-400",
  },
  {
    href: "/admin/menu",
    icon: "🍽️",
    label: "Menu & Settings",
    desc: "Prices, free-pot rule, tax / service charge",
    color: "hover:border-brand",
  },
  {
    href: "/admin/flavours",
    icon: "🥣",
    label: "Soup Flavours",
    desc: "Hotpot / BBQ soup flavour options",
    color: "hover:border-red-400",
  },
  {
    href: "/admin/categories",
    icon: "🏷️",
    label: "Expense Categories",
    desc: "Categories used in the expense module",
    color: "hover:border-yellow-400",
  },
  {
    href: "/admin/stock-items",
    icon: "📦",
    label: "Stock Items",
    desc: "Ingredients and materials tracked in inventory",
    color: "hover:border-blue-400",
  },
  {
    href: "/admin/suppliers",
    icon: "🚚",
    label: "Suppliers",
    desc: "Vendor list for purchases and deliveries",
    color: "hover:border-indigo-400",
  },
  {
    href: "/admin/roles",
    icon: "🔑",
    label: "Roles",
    desc: "Define custom staff roles and system permissions",
    color: "hover:border-purple-400",
  },
  {
    href: "/admin/hr-fields",
    icon: "📋",
    label: "Employee Fields",
    desc: "Custom fields shown on employee profiles",
    color: "hover:border-emerald-400",
  },
];

export default function AdminHome() {
  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Admin</h1>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className={
              "group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md " +
              c.color
            }
          >
            <div className="text-3xl">{c.icon}</div>
            <div className="mt-3 font-semibold text-gray-800 group-hover:text-brand">
              {c.label}
            </div>
            <div className="mt-0.5 text-sm text-gray-500">{c.desc}</div>
          </Link>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
        <span className="font-medium text-gray-600">User accounts</span> are created in{" "}
        <Link href="/hr/employees/new" className="text-brand hover:underline font-medium">
          HR → New Employee
        </Link>
        {" "}and can be managed at{" "}
        <Link href="/admin/users" className="text-brand hover:underline font-medium">
          Admin → Users
        </Link>.
      </div>
    </div>
  );
}
