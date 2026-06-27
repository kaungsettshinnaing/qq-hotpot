import { prisma } from "@/lib/db";
import SubmitButton from "@/components/SubmitButton";
import { createSupplier, updateSupplier, toggleSupplier } from "./actions";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const t = await getT();
  const { edit } = await searchParams;
  const suppliers = await prisma.supplier.findMany({ orderBy: { name: "asc" } });
  const editing = edit ? suppliers.find((s) => s.id === edit) : null;

  const spendData = await prisma.stockDelivery.groupBy({
    by: ["supplierId"],
    where: { paymentStatus: { in: ["PREPAID", "PAID"] }, totalCost: { not: null } },
    _sum: { totalCost: true },
  });
  const spendMap = new Map(spendData.map((s) => [s.supplierId, s._sum.totalCost ?? 0]));

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <section className="rounded-xl bg-white shadow-sm">
          <h3 className="border-b border-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">
            {t("admin_card_suppliers_label")} ({suppliers.length})
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500">
                <th className="px-4 py-2 text-left font-medium">{t("col_name")}</th>
                <th className="px-4 py-2 text-left font-medium">{t("col_contact")}</th>
                <th className="px-4 py-2 text-left font-medium">{t("col_phone")}</th>
                <th className="px-4 py-2 text-right font-medium">{t("col_total_spent")}</th>
                <th className="px-4 py-2 text-right font-medium">{t("col_actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {suppliers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-gray-400">{t("empty_no_suppliers")}</td>
                </tr>
              )}
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-2">
                    <span className={s.isActive ? "font-medium" : "font-medium text-gray-400 line-through"}>
                      {s.name}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-600">{s.contact ?? "—"}</td>
                  <td className="px-4 py-2 text-gray-600">{s.phone ?? "—"}</td>
                  <td className="px-4 py-2 text-right text-gray-700">
                    {(spendMap.get(s.id) ?? 0).toLocaleString()} MMK
                  </td>
                  <td className="px-4 py-2 text-right space-x-2">
                    <a href={`/admin/suppliers?edit=${s.id}`} className="text-xs text-blue-600 hover:underline">
                      {t("btn_edit")}
                    </a>
                    <form action={toggleSupplier} className="inline">
                      <input type="hidden" name="id" value={s.id} />
                      <button className="text-xs text-gray-500 hover:underline">
                        {s.isActive ? t("btn_deactivate") : t("btn_activate")}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <div className="space-y-4">
        {editing && (
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-700">
              {t("label_edit_prefix")} {editing.name}
            </h3>
            <form action={updateSupplier} className="space-y-2 text-sm">
              <input type="hidden" name="id" value={editing.id} />
              <input name="name" required defaultValue={editing.name}
                placeholder={t("placeholder_supplier_name")}
                className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              <input name="contact" defaultValue={editing.contact ?? ""}
                placeholder={t("placeholder_contact_person")}
                className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              <input name="phone" defaultValue={editing.phone ?? ""}
                placeholder={t("placeholder_phone")}
                className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              <input name="address" defaultValue={editing.address ?? ""}
                placeholder={t("placeholder_address")}
                className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              <textarea name="notes" defaultValue={editing.notes ?? ""}
                placeholder={t("placeholder_notes")} rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              <div className="flex gap-2">
                <SubmitButton className="flex-1 rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
                  {t("btn_save")}
                </SubmitButton>
                <a href="/admin/suppliers"
                  className="flex-1 rounded-lg border border-gray-300 py-2 text-center text-sm text-gray-600 hover:bg-gray-50">
                  {t("btn_cancel")}
                </a>
              </div>
            </form>
          </section>
        )}

        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">{t("btn_add_supplier")}</h3>
          <form action={createSupplier} className="space-y-2 text-sm">
            <input name="name" required placeholder={t("placeholder_supplier_name")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2" />
            <input name="contact" placeholder={t("placeholder_contact_person")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2" />
            <input name="phone" placeholder={t("placeholder_phone")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2" />
            <input name="address" placeholder={t("placeholder_address")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2" />
            <textarea name="notes" placeholder={t("placeholder_notes")} rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2" />
            <SubmitButton className="w-full rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
              {t("btn_add_supplier")}
            </SubmitButton>
          </form>
        </section>
      </div>
    </div>
  );
}
