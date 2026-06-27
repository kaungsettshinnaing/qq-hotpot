import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import SubmitButton from "@/components/SubmitButton";
import MenuItemRow from "./MenuItemRow";
import { createMenuItem, updateSettings } from "../actions";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

export default async function AdminMenuPage() {
  const t = await getT();
  const [items, settings] = await Promise.all([
    prisma.menuItem.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] }),
    getSettings(),
  ]);

  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const cat = item.category.trim() || t("label_other");
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(item);
  }
  const sortedGroups = [...groups.entries()].sort(([a], [b]) =>
    a === t("label_other") ? 1 : b === t("label_other") ? -1 : a.localeCompare(b),
  );

  const rowLabels = {
    save: t("btn_save"),
    hide: t("btn_hide"),
    show: t("btn_show"),
    perGram: t("label_unit_gram"),
    perUnit: t("label_unit_unit"),
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      {/* Menu prices */}
      <div className="space-y-4 lg:col-span-2">
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">
            {t("heading_menu_prices")} ({settings.currency})
          </h3>
          {items.length === 0 && (
            <p className="text-sm text-gray-400">{t("empty_no_menu_items")}</p>
          )}
          <div className="space-y-4">
            {sortedGroups.map(([cat, catItems]) => (
              <div key={cat}>
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    {cat}
                  </span>
                  <div className="flex-1 border-t border-gray-100" />
                </div>
                <div className="space-y-1.5">
                  {catItems.map((it) => (
                    <MenuItemRow key={it.code} item={it} currency={settings.currency} labels={rowLabels} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Add new item */}
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">{t("heading_add_menu_item")}</h3>
          <form action={createMenuItem} className="flex flex-wrap items-end gap-2 text-sm">
            <label className="block flex-1 min-w-40">
              <span className="mb-1 block text-xs font-medium text-gray-500">{t("label_item_name")}</span>
              <input
                name="name"
                required
                placeholder="e.g. Soft Drink"
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="block w-36">
              <span className="mb-1 block text-xs font-medium text-gray-500">{t("label_category")}</span>
              <input
                name="category"
                placeholder="e.g. Drinks"
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="block w-28">
              <span className="mb-1 block text-xs font-medium text-gray-500">
                {t("label_price")} ({settings.currency})
              </span>
              <input
                name="price"
                type="number"
                min={0}
                defaultValue={0}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="block w-28">
              <span className="mb-1 block text-xs font-medium text-gray-500">{t("label_unit")}</span>
              <select name="unit" className="w-full rounded-lg border border-gray-300 px-3 py-2">
                <option value="UNIT">{t("option_per_unit")}</option>
                <option value="GRAM">{t("option_per_gram")}</option>
              </select>
            </label>
            <SubmitButton className="rounded-lg bg-brand px-5 py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
              {t("btn_add_item")}
            </SubmitButton>
          </form>
        </section>
      </div>

      {/* Settings */}
      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">{t("heading_restaurant_settings")}</h3>
        <form action={updateSettings} className="space-y-3 text-sm">
          <Field label={t("label_restaurant_name")}>
            <input
              name="restaurantName"
              defaultValue={settings.restaurantName}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("label_currency")}>
              <input
                name="currency"
                defaultValue={settings.currency}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </Field>
            <Field label={t("label_reservation_block")}>
              <input
                name="reservationBlockMins"
                type="number"
                min={0}
                defaultValue={settings.reservationBlockMins}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("label_free_pot_ratio")}>
              <input
                name="freePotRatio"
                type="number"
                min={1}
                defaultValue={settings.freePotRatio}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </Field>
            <Field label={t("label_rounding")}>
              <select
                name="freePotRounding"
                defaultValue={settings.freePotRounding}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              >
                <option value="UP">{t("option_round_up")}</option>
                <option value="DOWN">{t("option_round_down")}</option>
              </select>
            </Field>
          </div>

          <fieldset className="rounded-lg border border-gray-200 p-3">
            <legend className="px-1 text-xs text-gray-500">{t("legend_service_charge")}</legend>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="serviceEnabled"
                defaultChecked={settings.serviceEnabled}
              />
              {t("label_enable_service_charge")}
            </label>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-gray-500">{t("label_rate_pct")}</span>
              <input
                name="serviceRatePct"
                type="number"
                step="0.1"
                min={0}
                max={100}
                defaultValue={settings.serviceRatePct}
                className="w-24 rounded-lg border border-gray-300 px-2 py-1.5"
              />
            </div>
          </fieldset>

          <fieldset className="rounded-lg border border-gray-200 p-3">
            <legend className="px-1 text-xs text-gray-500">{t("legend_commercial_tax")}</legend>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="taxEnabled" defaultChecked={settings.taxEnabled} />
              {t("label_enable_tax")}
            </label>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-gray-500">{t("label_rate_pct")}</span>
              <input
                name="taxRatePct"
                type="number"
                step="0.1"
                min={0}
                max={100}
                defaultValue={settings.taxRatePct}
                className="w-24 rounded-lg border border-gray-300 px-2 py-1.5"
              />
            </div>
          </fieldset>

          <SubmitButton className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
            {t("btn_save_settings")}
          </SubmitButton>
        </form>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      {children}
    </label>
  );
}
