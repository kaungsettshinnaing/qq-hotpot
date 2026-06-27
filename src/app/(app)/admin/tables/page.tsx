import { prisma } from "@/lib/db";
import SubmitButton from "@/components/SubmitButton";
import { createArea, createTable, toggleArea, toggleTable, moveArea } from "../actions";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

export default async function AdminTablesPage() {
  const t = await getT();
  const areas = await prisma.area.findMany({
    include: { tables: { orderBy: { number: "asc" } } },
    orderBy: { sortOrder: "asc" },
  });

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {areas.length === 0 && (
          <p className="text-sm text-gray-500">{t("empty_no_areas_admin")}</p>
        )}
        {areas.map((area, idx) => (
          <section key={area.id} className="rounded-xl bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold">
                {t("label_area_prefix")} {area.name}
                {!area.isActive && (
                  <span className="ml-2 rounded bg-gray-200 px-1.5 text-xs text-gray-500">
                    {t("badge_hidden")}
                  </span>
                )}
              </h3>

              <div className="flex items-center gap-1">
                <form action={moveArea}>
                  <input type="hidden" name="id" value={area.id} />
                  <input type="hidden" name="direction" value="up" />
                  <button
                    type="submit"
                    disabled={idx === 0}
                    title="Move up"
                    className="rounded px-1.5 py-0.5 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    ▲
                  </button>
                </form>

                <form action={moveArea}>
                  <input type="hidden" name="id" value={area.id} />
                  <input type="hidden" name="direction" value="down" />
                  <button
                    type="submit"
                    disabled={idx === areas.length - 1}
                    title="Move down"
                    className="rounded px-1.5 py-0.5 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    ▼
                  </button>
                </form>

                <form action={toggleArea}>
                  <input type="hidden" name="id" value={area.id} />
                  <button className="ml-1 text-xs text-gray-500 hover:underline">
                    {area.isActive ? t("btn_hide") : t("btn_show")}
                  </button>
                </form>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {area.tables.map((tb) => (
                <form key={tb.id} action={toggleTable}>
                  <input type="hidden" name="id" value={tb.id} />
                  <button
                    className={
                      "rounded-lg border px-3 py-1.5 text-sm font-medium " +
                      (tb.isActive
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "border-gray-200 bg-gray-100 text-gray-400 line-through")
                    }
                    title={tb.isActive ? t("title_click_to_hide") : t("title_click_to_show")}
                  >
                    {tb.label}
                  </button>
                </form>
              ))}
              {area.tables.length === 0 && (
                <span className="text-sm text-gray-400">{t("empty_no_tables")}</span>
              )}
            </div>
          </section>
        ))}
      </div>

      <div className="space-y-4">
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">{t("section_add_area")}</h3>
          <form action={createArea} className="space-y-2 text-sm">
            <input
              name="name"
              required
              placeholder={t("placeholder_area_name")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
            <SubmitButton className="w-full rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
              {t("btn_add_area")}
            </SubmitButton>
          </form>
        </section>

        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">{t("btn_add_table")}</h3>
          <form action={createTable} className="space-y-2 text-sm">
            <select name="areaId" required className="w-full rounded-lg border border-gray-300 px-3 py-2">
              <option value="">{t("placeholder_choose_area")}</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {t("label_area_prefix")} {a.name}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input
                name="number"
                type="number"
                min={1}
                required
                placeholder={t("placeholder_number")}
                className="rounded-lg border border-gray-300 px-3 py-2"
              />
              <input
                name="capacity"
                type="number"
                min={0}
                defaultValue={4}
                placeholder={t("placeholder_seats")}
                className="rounded-lg border border-gray-300 px-3 py-2"
              />
            </div>
            <SubmitButton className="w-full rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
              {t("btn_add_table")}
            </SubmitButton>
            <p className="text-[11px] text-gray-400">
              {t("hint_table_label")}
            </p>
          </form>
        </section>
      </div>
    </div>
  );
}
