import { prisma } from "@/lib/db";
import { requireAnyRole } from "@/lib/auth";
import SubmitButton from "@/components/SubmitButton";
import CategoryItemSelect from "@/components/CategoryItemSelect";
import { recordUsage } from "../actions";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

const UNIT_LABEL: Record<string, string> = {
  UNIT: "Unit", GRAM: "Gram", KG: "KG", LITRE: "Litre", BOX: "Box", BOTTLE: "Bottle", PACK: "Pack",
};

export default async function NewUsagePage() {
  await requireAnyRole(["WAITER", "KITCHEN", "MANAGER", "ADMIN"]);
  const t = await getT();

  const [categories, uncategorized] = await Promise.all([
    prisma.stockCategory.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: { items: { where: { isActive: true }, orderBy: { name: "asc" } } },
    }),
    prisma.stockItem.findMany({
      where: { isActive: true, categoryId: null },
      orderBy: { name: "asc" },
    }),
  ]);

  const pickerCategories = [
    ...categories.map((c) => ({
      id: c.id,
      name: c.name,
      items: c.items.map((i) => ({ id: i.id, name: i.name, meta: UNIT_LABEL[i.unit] })),
    })),
    ...(uncategorized.length > 0 ? [{
      id: "__uncategorized__",
      name: t("label_uncategorized"),
      items: uncategorized.map((i) => ({ id: i.id, name: i.name, meta: UNIT_LABEL[i.unit] })),
    }] : []),
  ];

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800">{t("heading_record_stock_usage")}</h2>
        <a href="/inventory/usage" className="text-sm text-blue-600 hover:underline">{t("btn_cancel")}</a>
      </div>

      <section className="rounded-xl bg-white p-5 shadow-sm">
        <form action={recordUsage} className="space-y-4 text-sm">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">{t("label_item")}</label>
            <CategoryItemSelect
              categories={pickerCategories}
              categoryPlaceholder={`— ${t("label_category")} —`}
              itemPlaceholder={`— ${t("label_item")} —`}
              selectClassName="w-full rounded-lg border border-gray-300 px-3 py-2"
              className="flex-col"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">{t("label_quantity_used")}</label>
            <input name="qty" type="number" min="1" required placeholder="0"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-lg font-semibold" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">{t("label_note_optional")}</label>
            <input name="note" placeholder={t("placeholder_usage_note")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </div>

          <SubmitButton className="w-full rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
            {t("btn_record_usage")}
          </SubmitButton>
        </form>
      </section>
    </div>
  );
}
