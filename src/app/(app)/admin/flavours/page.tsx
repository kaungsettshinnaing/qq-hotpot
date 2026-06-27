import { prisma } from "@/lib/db";
import SubmitButton from "@/components/SubmitButton";
import { createFlavour, updateFlavour, toggleFlavour, moveFlavour } from "../actions";
import DeleteFlavourButton from "./DeleteFlavourButton";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

export default async function AdminFlavoursPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; error?: string }>;
}) {
  const t = await getT();
  const { edit: editId } = await searchParams;

  const flavours = await prisma.soupFlavour.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const editTarget = editId ? flavours.find((f) => f.id === editId) : null;

  const hotpot = flavours.filter((f) => f.appliesTo === "HOTPOT" || f.appliesTo === "BOTH");
  const bbq    = flavours.filter((f) => f.appliesTo === "BBQ"    || f.appliesTo === "BOTH");

  const applyToLabel = (val: string) =>
    val === "BOTH"   ? t("option_both_types") :
    val === "HOTPOT" ? t("option_hotpot_only") :
                       t("option_bbq_only");

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {/* Preview buckets */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FlavourBucket
            title="🍲 Hotpot"
            flavours={hotpot}
            activeLabel={t("card_active_suffix")}
            noActiveLabel={t("empty_no_active_flavours")}
            hiddenLabel={(n) => t("label_n_hidden", { n: String(n) })}
          />
          <FlavourBucket
            title="🔥 BBQ"
            flavours={bbq}
            activeLabel={t("card_active_suffix")}
            noActiveLabel={t("empty_no_active_flavours")}
            hiddenLabel={(n) => t("label_n_hidden", { n: String(n) })}
          />
        </div>

        {/* Management list */}
        <section className="rounded-xl bg-white shadow-sm">
          <h3 className="border-b border-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">
            {t("heading_all_flavours")} ({flavours.length})
          </h3>
          <ul className="divide-y divide-gray-100">
            {flavours.length === 0 && (
              <li className="px-4 py-3 text-sm text-gray-400">{t("empty_no_flavours")}</li>
            )}
            {flavours.map((f, idx) => (
              <li key={f.id}>
                {editTarget?.id === f.id ? (
                  <form action={updateFlavour} className="flex flex-wrap items-center gap-2 px-4 py-2">
                    <input type="hidden" name="id" value={f.id} />
                    <input
                      name="name"
                      defaultValue={f.name}
                      required
                      className="flex-1 min-w-32 rounded-lg border border-brand px-2 py-1 text-sm"
                    />
                    <select
                      name="appliesTo"
                      defaultValue={f.appliesTo}
                      className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
                    >
                      <option value="HOTPOT">{t("option_hotpot_only")}</option>
                      <option value="BBQ">{t("option_bbq_only")}</option>
                      <option value="BOTH">{t("option_both_types")}</option>
                    </select>
                    <SubmitButton className="rounded-lg bg-brand px-3 py-1 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
                      {t("btn_save")}
                    </SubmitButton>
                    <a href="/admin/flavours" className="text-xs text-gray-500 hover:underline">{t("btn_cancel")}</a>
                  </form>
                ) : (
                  <div className="flex items-center justify-between px-4 py-2 text-sm">
                    <span>
                      <span className={f.isActive ? "font-medium" : "font-medium text-gray-400 line-through"}>
                        {f.name}
                      </span>
                      <span className="ml-2 text-[10px] rounded-full px-1.5 py-0.5 bg-gray-100 text-gray-500">
                        {applyToLabel(f.appliesTo)}
                      </span>
                    </span>
                    <div className="flex items-center gap-1">
                      <form action={moveFlavour}>
                        <input type="hidden" name="id" value={f.id} />
                        <input type="hidden" name="direction" value="up" />
                        <button type="submit" disabled={idx === 0}
                          className="rounded px-1.5 py-0.5 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30">
                          ▲
                        </button>
                      </form>
                      <form action={moveFlavour}>
                        <input type="hidden" name="id" value={f.id} />
                        <input type="hidden" name="direction" value="down" />
                        <button type="submit" disabled={idx === flavours.length - 1}
                          className="rounded px-1.5 py-0.5 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30">
                          ▼
                        </button>
                      </form>
                      <a
                        href={`/admin/flavours?edit=${f.id}`}
                        className="ml-1 text-xs text-brand hover:underline"
                      >
                        {t("btn_edit")}
                      </a>
                      <form action={toggleFlavour}>
                        <input type="hidden" name="id" value={f.id} />
                        <button className="ml-1 text-xs text-gray-500 hover:underline">
                          {f.isActive ? t("btn_hide") : t("btn_show")}
                        </button>
                      </form>
                      <DeleteFlavourButton
                        id={f.id}
                        name={f.name}
                        labels={{
                          delete: t("btn_delete"),
                          confirm: t("confirm_delete_item", { name: f.name }),
                        }}
                      />
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Add panel */}
      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">{t("btn_add_flavour")}</h3>
        <form action={createFlavour} className="space-y-2 text-sm">
          <input
            name="name"
            required
            placeholder={t("placeholder_flavour_name")}
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
          <select name="appliesTo" className="w-full rounded-lg border border-gray-300 px-3 py-2">
            <option value="HOTPOT">{t("option_hotpot_only")}</option>
            <option value="BBQ">{t("option_bbq_only")}</option>
            <option value="BOTH">{t("option_both_types")}</option>
          </select>
          <SubmitButton className="w-full rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
            {t("btn_add_flavour")}
          </SubmitButton>
        </form>
      </section>
    </div>
  );
}

function FlavourBucket({
  title,
  flavours,
  activeLabel,
  noActiveLabel,
  hiddenLabel,
}: {
  title: string;
  flavours: { id: string; name: string; isActive: boolean; appliesTo: string }[];
  activeLabel: string;
  noActiveLabel: string;
  hiddenLabel: (n: number) => string;
}) {
  const active = flavours.filter((f) => f.isActive);
  const hidden = flavours.length - active.length;
  return (
    <div className="rounded-xl bg-white shadow-sm">
      <h3 className="border-b border-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700">
        {title}
        <span className="ml-1.5 text-xs font-normal text-gray-400">({active.length} {activeLabel})</span>
      </h3>
      <ul className="divide-y divide-gray-100">
        {active.length === 0 && (
          <li className="px-4 py-3 text-xs text-gray-400">{noActiveLabel}</li>
        )}
        {active.map((f) => (
          <li key={f.id} className="flex items-center gap-2 px-4 py-2 text-sm">
            <span className="flex-1 font-medium text-gray-800">{f.name}</span>
            {f.appliesTo === "BOTH" && (
              <span className="text-[10px] text-gray-400">Both</span>
            )}
          </li>
        ))}
        {hidden > 0 && (
          <li className="px-4 py-2 text-xs text-gray-400">{hiddenLabel(hidden)}</li>
        )}
      </ul>
    </div>
  );
}
