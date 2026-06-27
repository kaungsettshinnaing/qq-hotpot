import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getT } from "@/lib/lang";

async function createField(fd: FormData) {
  "use server";
  await requireAnyRole(["ADMIN"]);
  const label = (fd.get("label") as string).trim();
  const fieldType = fd.get("fieldType") as "TEXT" | "NUMBER" | "DATE" | "DROPDOWN";
  const optionsRaw = (fd.get("options") as string | null) ?? "";
  const options = fieldType === "DROPDOWN"
    ? optionsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const isRequired = fd.get("isRequired") === "on";
  if (!label) return;
  await prisma.employeeFieldDef.create({ data: { label, fieldType, options, isRequired } });
  revalidatePath("/admin/hr-fields");
}

async function toggleField(fd: FormData) {
  "use server";
  await requireAnyRole(["ADMIN"]);
  const id = fd.get("id") as string;
  const current = await prisma.employeeFieldDef.findUnique({ where: { id } });
  if (!current) return;
  await prisma.employeeFieldDef.update({ where: { id }, data: { isActive: !current.isActive } });
  revalidatePath("/admin/hr-fields");
}

export default async function HRFieldsPage() {
  const t = await getT();
  const fields = await prisma.employeeFieldDef.findMany({ orderBy: { sortOrder: "asc" } });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">{t("heading_custom_emp_fields")}</h1>

      {/* Create */}
      <form action={createField} className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-semibold">{t("heading_add_field")}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label">{t("col_name")}</label>
            <input name="label" required className="input" placeholder="e.g. NRC Number" />
          </div>
          <div>
            <label className="label">{t("col_type")}</label>
            <select name="fieldType" className="input">
              <option value="TEXT">{t("option_text_type")}</option>
              <option value="NUMBER">{t("option_number_type")}</option>
              <option value="DATE">{t("option_date_type")}</option>
              <option value="DROPDOWN">{t("option_dropdown")}</option>
            </select>
          </div>
          <div>
            <label className="label">{t("label_options_csv")}</label>
            <input name="options" className="input" placeholder="Option A, Option B" />
          </div>
          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isRequired" />
              {t("label_required")}
            </label>
            <button type="submit" className="btn-brand">{t("btn_add")}</button>
          </div>
        </div>
      </form>

      {/* List */}
      <div className="rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">{t("col_name")}</th>
              <th className="px-4 py-2">{t("col_type")}</th>
              <th className="px-4 py-2">{t("col_options")}</th>
              <th className="px-4 py-2">{t("col_required")}</th>
              <th className="px-4 py-2">{t("col_status")}</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {fields.map((f) => (
              <tr key={f.id}>
                <td className="px-4 py-2 font-medium">{f.label}</td>
                <td className="px-4 py-2 text-gray-500">{f.fieldType}</td>
                <td className="px-4 py-2 text-gray-500">{f.options.join(", ") || "—"}</td>
                <td className="px-4 py-2">{f.isRequired ? t("label_yes") : t("label_no")}</td>
                <td className="px-4 py-2">
                  <span className={`badge ${f.isActive ? "badge-green" : "badge-gray"}`}>
                    {f.isActive ? t("label_active_badge") : t("label_inactive")}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <form action={toggleField}>
                    <input type="hidden" name="id" value={f.id} />
                    <button type="submit" className="text-xs text-brand hover:underline">
                      {f.isActive ? t("btn_disable") : t("btn_enable")}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {fields.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  {t("empty_no_custom_fields")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
