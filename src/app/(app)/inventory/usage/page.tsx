import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { hasAnyRole } from "@/lib/rbac";
import SubmitButton from "@/components/SubmitButton";
import CategoryItemSelect from "@/components/CategoryItemSelect";
import { formatDateTime } from "@/lib/format";
import { recordAdjustment } from "./actions";
import { computeAllStockLevels } from "@/lib/inventory";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

export default async function UsagePage() {
  const t = await getT();
  const session = await getSession();
  const isManager = session && hasAnyRole(session.roles, ["MANAGER", "ADMIN"]);

  const typeLabel = {
    DELIVERY_IN: { label: t("type_delivery_in"), cls: "text-green-600" },
    USAGE_OUT:   { label: t("type_usage_out"),   cls: "text-red-600" },
    ADJUSTMENT:  { label: t("type_adjustment"),  cls: "text-blue-600" },
  } as Record<string, { label: string; cls: string }>;

  const UNIT_LABEL: Record<string, string> = {
    UNIT: "Unit", GRAM: "Gram", KG: "KG", LITRE: "Litre", BOX: "Box", BOTTLE: "Bottle", PACK: "Pack",
  };

  const [movements, categories, uncategorized, stockMap] = await Promise.all([
    prisma.stockMovement.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        stockItem: { select: { name: true, unit: true } },
        recordedBy: { select: { name: true } },
      },
    }),
    prisma.stockCategory.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: { items: { where: { isActive: true }, orderBy: { name: "asc" } } },
    }),
    prisma.stockItem.findMany({
      where: { isActive: true, categoryId: null },
      orderBy: { name: "asc" },
    }),
    computeAllStockLevels(),
  ]);

  const itemMeta = (item: { id: string; unit: string }) =>
    `${t("col_current")}: ${stockMap.get(item.id) ?? 0} ${UNIT_LABEL[item.unit]}`;

  const pickerCategories = [
    ...categories.map((c) => ({
      id: c.id,
      name: c.name,
      items: c.items.map((i) => ({ id: i.id, name: i.name, meta: itemMeta(i) })),
    })),
    ...(uncategorized.length > 0 ? [{
      id: "__uncategorized__",
      name: t("label_uncategorized"),
      items: uncategorized.map((i) => ({ id: i.id, name: i.name, meta: itemMeta(i) })),
    }] : []),
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800">{t("heading_stock_usage")}</h2>
        <Link href="/inventory/usage/new"
          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark">
          {t("btn_record_usage")}
        </Link>
      </div>

      {isManager && (
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">{t("section_manual_adjustment")}</h3>
          <p className="mb-3 text-xs text-gray-500">{t("hint_manual_adjustment")}</p>
          <form action={recordAdjustment} className="flex flex-wrap items-start gap-3 text-sm">
            <CategoryItemSelect
              categories={pickerCategories}
              categoryPlaceholder={`— ${t("label_category")} —`}
              itemPlaceholder={`— ${t("label_item")} —`}
            />
            <select name="direction" required
              className="rounded-lg border border-gray-300 px-3 py-2">
              <option value="ADD">{t("option_add_stock")}</option>
              <option value="REMOVE">{t("option_remove_stock")}</option>
            </select>
            <input name="qty" type="number" min="1" required placeholder={t("placeholder_adjustment_qty")}
              className="w-28 rounded-lg border border-gray-300 px-3 py-2" />
            <input name="note" placeholder={t("placeholder_adj_reason")}
              className="flex-1 min-w-[200px] rounded-lg border border-gray-300 px-3 py-2" />
            <SubmitButton className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
              {t("btn_adjust")}
            </SubmitButton>
          </form>
        </section>
      )}

      <section className="rounded-xl bg-white shadow-sm">
        <h3 className="border-b border-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">
          {t("section_recent_movements")}
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-500">
              <th className="px-4 py-2 text-left font-medium">{t("col_date_time")}</th>
              <th className="px-4 py-2 text-left font-medium">{t("col_item")}</th>
              <th className="px-4 py-2 text-center font-medium">{t("col_type")}</th>
              <th className="px-4 py-2 text-center font-medium">{t("col_qty")}</th>
              <th className="px-4 py-2 text-left font-medium">{t("col_note")}</th>
              <th className="px-4 py-2 text-left font-medium">{t("col_by")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {movements.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  {t("empty_no_movements")}
                </td>
              </tr>
            )}
            {movements.map((m) => {
              const type = typeLabel[m.type] ?? { label: m.type, cls: "text-gray-600" };
              return (
                <tr key={m.id}>
                  <td className="px-4 py-2 text-gray-500 text-xs">
                    {formatDateTime(m.createdAt)}
                  </td>
                  <td className="px-4 py-2 font-medium text-gray-800">{m.stockItem.name}</td>
                  <td className={`px-4 py-2 text-center text-xs font-semibold ${type.cls}`}>{type.label}</td>
                  <td className={`px-4 py-2 text-center font-bold ${m.qty > 0 ? "text-green-600" : "text-red-600"}`}>
                    {m.qty > 0 ? `+${m.qty}` : m.qty}
                  </td>
                  <td className="px-4 py-2 text-gray-600">{m.note ?? "—"}</td>
                  <td className="px-4 py-2 text-gray-500">{m.recordedBy.name}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
