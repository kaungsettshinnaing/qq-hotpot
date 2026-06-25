import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

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
  const fields = await prisma.employeeFieldDef.findMany({ orderBy: { sortOrder: "asc" } });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Custom Employee Fields</h1>

      {/* Create */}
      <form action={createField} className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-semibold">Add Field</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label">Label</label>
            <input name="label" required className="input" placeholder="e.g. NRC Number" />
          </div>
          <div>
            <label className="label">Type</label>
            <select name="fieldType" className="input">
              <option value="TEXT">Text</option>
              <option value="NUMBER">Number</option>
              <option value="DATE">Date</option>
              <option value="DROPDOWN">Dropdown</option>
            </select>
          </div>
          <div>
            <label className="label">Options (dropdown only, comma-separated)</label>
            <input name="options" className="input" placeholder="Option A, Option B" />
          </div>
          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isRequired" />
              Required
            </label>
            <button type="submit" className="btn-brand">Add</button>
          </div>
        </div>
      </form>

      {/* List */}
      <div className="rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Label</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Options</th>
              <th className="px-4 py-2">Required</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {fields.map((f) => (
              <tr key={f.id}>
                <td className="px-4 py-2 font-medium">{f.label}</td>
                <td className="px-4 py-2 text-gray-500">{f.fieldType}</td>
                <td className="px-4 py-2 text-gray-500">{f.options.join(", ") || "—"}</td>
                <td className="px-4 py-2">{f.isRequired ? "Yes" : "No"}</td>
                <td className="px-4 py-2">
                  <span className={`badge ${f.isActive ? "badge-green" : "badge-gray"}`}>
                    {f.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <form action={toggleField}>
                    <input type="hidden" name="id" value={f.id} />
                    <button type="submit" className="text-xs text-brand hover:underline">
                      {f.isActive ? "Disable" : "Enable"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {fields.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">No custom fields yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
