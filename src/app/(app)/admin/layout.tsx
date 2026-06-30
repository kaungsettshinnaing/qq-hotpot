import { requireAnyRole } from "@/lib/auth";
import { getT } from "@/lib/lang";
import TabNav from "@/components/TabNav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAnyRole(["ADMIN"]);
  const t = await getT();

  const tabs = [
    { href: "/admin/tables",      label: t("admin_card_areas_tables_label") },
    { href: "/admin/menu",        label: t("admin_card_menu_label") },
    { href: "/admin/flavours",    label: t("admin_card_flavours_label") },
    { href: "/admin/categories",  label: t("admin_card_expense_categories_label") },
    { href: "/admin/stock-categories", label: t("admin_card_stock_categories_label") },
    { href: "/admin/stock-items",      label: t("admin_card_stock_items_label") },
    { href: "/admin/suppliers",        label: t("admin_card_suppliers_label") },
    { href: "/admin/roles",       label: t("admin_card_roles_label") },
    { href: "/admin/hr-fields",   label: t("admin_card_employee_fields_label") },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-white p-3 shadow-sm border border-gray-100">
        <TabNav tabs={tabs} />
      </div>
      {children}
    </div>
  );
}
