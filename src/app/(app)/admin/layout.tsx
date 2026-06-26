import { requireAnyRole } from "@/lib/auth";
import TabNav from "@/components/TabNav";

export const dynamic = "force-dynamic";

const TABS = [
  { href: "/admin/tables",      label: "Areas & Tables" },
  { href: "/admin/menu",        label: "Menu & Settings" },
  { href: "/admin/flavours",    label: "Soup Flavours" },
  { href: "/admin/categories",  label: "Expense Categories" },
  { href: "/admin/stock-items", label: "Stock Items" },
  { href: "/admin/suppliers",   label: "Suppliers" },
  { href: "/admin/roles",       label: "Roles" },
  { href: "/admin/hr-fields",   label: "Employee Fields" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAnyRole(["ADMIN"]);
  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-white p-3 shadow-sm border border-gray-100">
        <TabNav tabs={TABS} />
      </div>
      {children}
    </div>
  );
}
