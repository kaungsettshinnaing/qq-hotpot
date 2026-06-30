import Link from "next/link";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const t = await getT();

  const CARDS = [
    {
      href: "/admin/tables",
      icon: "🪑",
      label: t("admin_card_areas_tables_label"),
      desc: t("admin_card_areas_tables_desc"),
      color: "hover:border-amber-400",
    },
    {
      href: "/admin/menu",
      icon: "🍽️",
      label: t("admin_card_menu_label"),
      desc: t("admin_card_menu_desc"),
      color: "hover:border-brand",
    },
    {
      href: "/admin/flavours",
      icon: "🥣",
      label: t("admin_card_flavours_label"),
      desc: t("admin_card_flavours_desc"),
      color: "hover:border-red-400",
    },
    {
      href: "/admin/categories",
      icon: "🏷️",
      label: t("admin_card_expense_categories_label"),
      desc: t("admin_card_expense_categories_desc"),
      color: "hover:border-yellow-400",
    },
    {
      href: "/admin/suppliers",
      icon: "🚚",
      label: t("admin_card_suppliers_label"),
      desc: t("admin_card_suppliers_desc"),
      color: "hover:border-indigo-400",
    },
    {
      href: "/admin/roles",
      icon: "🔑",
      label: t("admin_card_roles_label"),
      desc: t("admin_card_roles_desc"),
      color: "hover:border-purple-400",
    },
    {
      href: "/admin/hr-fields",
      icon: "📋",
      label: t("admin_card_employee_fields_label"),
      desc: t("admin_card_employee_fields_desc"),
      color: "hover:border-emerald-400",
    },
  ];

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">{t("heading_admin")}</h1>
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
    </div>
  );
}
