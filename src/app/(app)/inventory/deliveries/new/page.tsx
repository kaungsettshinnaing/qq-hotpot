import { prisma } from "@/lib/db";
import SubmitButton from "@/components/SubmitButton";
import { createDelivery } from "../[id]/actions";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

export default async function NewDeliveryPage({
  searchParams,
}: {
  searchParams: Promise<{ parentId?: string }>;
}) {
  const { parentId } = await searchParams;
  const t = await getT();

  const [suppliers, parent] = await Promise.all([
    prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    parentId ? prisma.stockDelivery.findUnique({
      where: { id: parentId },
      include: { supplier: true },
    }) : Promise.resolve(null),
  ]);

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="mx-auto max-w-lg">
      <h2 className="mb-4 text-base font-semibold text-gray-800">
        {parent
          ? `${t("heading_new_batch_delivery")} (follows ${parent.invoiceNo ?? parent.id.slice(-6)})`
          : t("heading_new_delivery")}
      </h2>

      {parent && (
        <div className="mb-4 rounded-lg bg-purple-50 border border-purple-200 px-4 py-3 text-sm text-purple-800">
          {t("hint_batch_delivery_from")}{" "}
          <strong>{parent.supplier?.name ?? t("label_unknown_supplier")}</strong>.{" "}
          {t("hint_batch_counted_sep")}
        </div>
      )}

      <section className="rounded-xl bg-white p-5 shadow-sm">
        <form action={createDelivery} className="space-y-4 text-sm">
          {parentId && <input type="hidden" name="parentId" value={parentId} />}

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">{t("label_supplier")}</label>
            <select name="supplierId"
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
              defaultValue={parent?.supplierId ?? ""}>
              <option value="">{t("option_no_supplier")}</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">{t("label_delivery_date")}</label>
            <input name="deliveryDate" type="date" required defaultValue={today}
              className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">{t("label_invoice_number")}</label>
            <input name="invoiceNo" placeholder={t("placeholder_invoice")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </div>

          <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500 space-y-1">
            <p>{t("hint_delivery_workflow_intro")}</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>{t("hint_delivery_workflow_cashier")}</li>
              <li>{t("hint_delivery_workflow_counter")}</li>
            </ul>
            <p>{t("hint_delivery_workflow_either")}</p>
          </div>

          <SubmitButton className="w-full rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
            {t("btn_create_delivery")}
          </SubmitButton>
        </form>
      </section>
    </div>
  );
}
