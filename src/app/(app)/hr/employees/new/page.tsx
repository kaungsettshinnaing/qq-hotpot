import Link from "next/link";
import { prisma } from "@/lib/db";
import { createEmployee } from "../actions";
import { getT } from "@/lib/lang";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function NewEmployeePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const t = await getT();

  const staffRoles = await prisma.staffRole.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });

  const errorMsg = error === "exists" ? t("error_username_exists")
    : error === "no-role" ? t("error_no_role_configured")
    : error ? t("error_fill_required")
    : null;

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t("heading_new_employee")}</h1>
        <Link href="/hr/employees" className="text-sm text-brand hover:underline">{t("link_back_to_employees")}</Link>
      </div>

      {errorMsg && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorMsg}</p>
      )}

      <form action={createEmployee} className="space-y-4 rounded-xl border bg-white p-6 shadow-sm">
        <input type="hidden" name="accountMode" value="create" />

        <div className="space-y-3 rounded-lg border border-brand/20 bg-brand/5 p-4">
          <h2 className="text-sm font-semibold text-brand">{t("subheading_login_credentials")}</h2>

          {staffRoles.length === 0 ? (
            <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
              {t("label_no_roles")}{" "}
              <Link href="/admin/roles" className="underline font-medium">
                {t("link_setup_roles")}
              </Link>{" "}
              first.
            </p>
          ) : (
            <div>
              <label className="label">{t("label_role")} *</label>
              <select name="staffRoleId" required className="input">
                <option value="">{t("select_role_placeholder")}</option>
                {staffRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({(r.permissions as string[]).join(", ")})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">{t("label_full_name")} *</label>
              <input name="name" required className="input" placeholder="e.g. Ko Aung" />
            </div>
            <div>
              <label className="label">{t("label_username_onboard")} *</label>
              <input name="username" required className="input" placeholder="e.g. ko_aung" />
            </div>
          </div>
          <div>
            <label className="label">{t("label_password")} *</label>
            <input name="password" required type="password" className="input" placeholder="••••••••" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">{t("label_employee_no")}</label>
            <input name="employeeNo" className="input" placeholder="EMP001" />
          </div>
          <div>
            <label className="label">{t("label_start_date")} *</label>
            <input name="startDate" required className="input" placeholder="26-Jun-2026" />
          </div>
          <div>
            <label className="label">{t("label_date_of_birth")}</label>
            <input name="dateOfBirth" className="input" placeholder="01-Jan-1990" />
          </div>
          <div>
            <label className="label">{t("label_phone")}</label>
            <input name="phone" className="input" />
          </div>
          <div>
            <label className="label">{t("label_basic_salary")}</label>
            <input name="basicSalary" type="number" min="0" className="input" defaultValue="0" />
          </div>
          <div>
            <label className="label">{t("label_attendance_bonus")}</label>
            <input name="attendanceBonus" type="number" min="0" className="input" defaultValue="0" />
          </div>
        </div>
        <div>
          <label className="label">{t("label_address_onboard")}</label>
          <input name="address" className="input" />
        </div>
        <div>
          <label className="label">{t("label_emergency_contact")}</label>
          <input name="emergencyContact" className="input" />
        </div>
        <div>
          <label className="label">{t("label_bank_account")}</label>
          <input name="bankAccount" className="input" />
        </div>
        <div>
          <label className="label">{t("label_rest_days")}</label>
          <div className="flex flex-wrap gap-3 pt-1">
            {DAYS.map((d, i) => (
              <label key={i} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" name="restDays" value={i} />
                {d}
              </label>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" name="isSystem" value="1" className="rounded" />
            <span className="text-sm font-medium text-gray-700">{t("checkbox_system_account")}</span>
          </label>
          <p className="mt-1 text-xs text-gray-400 ml-6">{t("label_system_account_note")}</p>
        </div>
        <div className="flex gap-2 pt-2">
          <button type="submit" className="btn-brand">{t("btn_create_employee")}</button>
          <a href="/hr/employees" className="btn-outline">{t("btn_cancel")}</a>
        </div>
      </form>
    </div>
  );
}
