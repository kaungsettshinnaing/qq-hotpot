import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { toggleEmployeeActive, resetEmployeePassword, toggleEmployeeSystem, deleteEmployee } from "../actions";
import DeleteEmployeeButton from "./DeleteEmployeeButton";
import SubmitButton from "@/components/SubmitButton";
import { getT } from "@/lib/lang";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function EmployeeProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getT();

  const [emp, fieldDefs] = await Promise.all([
    prisma.employee.findUnique({
      where: { userId: id },
      include: {
        user: true,
        staffRole: { select: { name: true } },
        customValues: { include: { fieldDef: true } },
        documents: true,
      },
    }),
    prisma.employeeFieldDef.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);
  if (!emp) notFound();

  const valueMap = Object.fromEntries(emp.customValues.map((v) => [v.fieldDefId, v.value]));

  const fields: [string, string][] = [
    [t("field_employee_no"), emp.employeeNo ?? "—"],
    [t("field_username"), emp.user.username],
    [t("field_role"), emp.staffRole?.name ?? "—"],
    [t("field_permissions"), emp.user.roles.join(", ")],
    [t("field_status"), emp.isActive ? t("tab_active") : t("tab_inactive")],
    [t("field_start_date"), formatDate(emp.startDate)],
    [t("field_date_of_birth"), formatDate(emp.dateOfBirth)],
    [t("label_phone"), emp.phone ?? "—"],
    [t("field_address"), emp.address ?? "—"],
    [t("field_emergency_contact"), emp.emergencyContact ?? "—"],
    [t("field_bank_account"), emp.bankAccount ?? "—"],
    [t("field_basic_salary"), `${emp.basicSalary.toLocaleString()} MMK`],
    [t("field_attendance_bonus"), `${emp.attendanceBonus.toLocaleString()} MMK`],
    [t("field_rest_days"), emp.restDays.map((d) => DAYS[d]).join(", ") || "—"],
  ];

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">{emp.user.name}</h1>
          {emp.isSystem && (
            <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700">
              {t("badge_system")}
            </span>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href={`/hr/employees/${emp.userId}/edit`} className="btn-outline">{t("btn_edit")}</Link>
          <Link href={`/hr/employees/${emp.userId}/documents`} className="btn-outline">{t("heading_documents")}</Link>
          <form action={toggleEmployeeSystem}>
            <input type="hidden" name="userId" value={emp.userId} />
            <button type="submit" className="btn-outline text-purple-600">
              {emp.isSystem ? t("btn_unmark_system") : t("btn_mark_as_system")}
            </button>
          </form>
          <form action={toggleEmployeeActive}>
            <input type="hidden" name="userId" value={emp.userId} />
            <button type="submit" className={emp.isActive ? "btn-outline text-red-600" : "btn-outline text-green-600"}>
              {emp.isActive ? t("btn_deactivate") : t("btn_activate")}
            </button>
          </form>
          <DeleteEmployeeButton userId={emp.userId} name={emp.user.name} />
        </div>
      </div>

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 text-sm">
          {fields.map(([label, value]) => (
            <div key={label}>
              <div className="text-xs text-gray-400">{label}</div>
              <div className="font-medium">{value}</div>
            </div>
          ))}
        </div>

        {fieldDefs.length > 0 && (
          <div className="mt-4 border-t pt-4 grid gap-3 sm:grid-cols-2 text-sm">
            {fieldDefs.map((def) => (
              <div key={def.id}>
                <div className="text-xs text-gray-400">{def.label}</div>
                <div className="font-medium">{valueMap[def.id] || "—"}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {emp.documents.length > 0 && (
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-semibold text-sm">{t("heading_documents")} ({emp.documents.length})</h2>
          <ul className="space-y-1 text-sm">
            {emp.documents.map((d) => (
              <li key={d.id}>
                <a href={d.filePath} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                  {d.name}
                </a>
                <span className="ml-2 text-xs text-gray-400">{formatDate(d.uploadedAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">{t("section_account_security")}</h2>
        <form action={resetEmployeePassword} className="flex items-center gap-2">
          <input type="hidden" name="userId" value={emp.userId} />
          <input
            name="password"
            type="password"
            placeholder={t("placeholder_new_password")}
            className="input flex-1"
            required
          />
          <SubmitButton className="btn-outline disabled:opacity-60">
            {t("btn_reset_password")}
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
