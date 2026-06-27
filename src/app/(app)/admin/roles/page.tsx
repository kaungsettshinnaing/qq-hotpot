import { prisma } from "@/lib/db";
import { ALL_ROLES } from "@/lib/rbac";
import SubmitButton from "@/components/SubmitButton";
import { createStaffRole, updateStaffRole, toggleStaffRole } from "../actions";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

const ROLE_COLORS: Record<string, string> = {
  ADMIN:     "bg-brand/10 text-brand border-brand/20",
  MANAGER:   "bg-purple-50 text-purple-700 border-purple-200",
  HR:        "bg-emerald-50 text-emerald-700 border-emerald-200",
  WAITER:    "bg-orange-50 text-orange-700 border-orange-200",
  KITCHEN:   "bg-yellow-50 text-yellow-700 border-yellow-200",
  CASHIER:   "bg-blue-50 text-blue-700 border-blue-200",
  MARKETING: "bg-pink-50 text-pink-700 border-pink-200",
};

function PermCheckboxes({ checked = [] }: { checked?: string[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3">
      {ALL_ROLES.map((r) => (
        <label key={r} className="flex items-center gap-1.5 text-xs text-gray-600">
          <input
            type="checkbox"
            name={`role_${r}`}
            defaultChecked={checked.includes(r)}
            className="accent-brand"
          />
          {r}
        </label>
      ))}
    </div>
  );
}

export default async function AdminRolesPage() {
  const t = await getT();
  const roles = await prisma.staffRole.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { employees: true } } },
  });

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      {/* Roles list */}
      <div className="space-y-4 lg:col-span-2">
        {roles.length === 0 && (
          <div className="rounded-xl bg-white p-6 shadow-sm text-center text-sm text-gray-400">
            {t("empty_no_roles_admin")}
          </div>
        )}
        {roles.map((role) => (
          <div
            key={role.id}
            className={
              "rounded-xl bg-white p-4 shadow-sm " +
              (!role.isActive ? "opacity-60" : "")
            }
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {!role.isActive && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
                    {t("label_inactive_badge")}
                  </span>
                )}
                <span className="text-xs text-gray-400">
                  {t("label_n_staff", { n: String(role._count.employees) })}
                </span>
              </div>
              <form action={toggleStaffRole}>
                <input type="hidden" name="id" value={role.id} />
                <button className="text-xs text-gray-500 hover:underline">
                  {role.isActive ? t("btn_deactivate") : t("btn_activate")}
                </button>
              </form>
            </div>

            <form action={updateStaffRole} className="space-y-3">
              <input type="hidden" name="id" value={role.id} />
              <input
                name="name"
                defaultValue={role.name}
                className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold focus:border-brand focus:outline-none"
              />

              {(role.permissions as string[]).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {(role.permissions as string[]).map((p) => (
                    <span
                      key={p}
                      className={
                        "rounded-full border px-2 py-0.5 text-[11px] font-medium " +
                        (ROLE_COLORS[p] ?? "bg-gray-50 text-gray-600 border-gray-200")
                      }
                    >
                      {p}
                    </span>
                  ))}
                </div>
              )}

              <PermCheckboxes checked={role.permissions as string[]} />

              <SubmitButton className="rounded-lg bg-brand px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
                {t("btn_save_changes")}
              </SubmitButton>
            </form>
          </div>
        ))}
      </div>

      {/* Add new role */}
      <div className="space-y-4">
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">{t("btn_add_role")}</h3>
          <form action={createStaffRole} className="space-y-3 text-sm">
            <input
              name="name"
              required
              placeholder={t("placeholder_role_name_ex")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-brand focus:outline-none"
            />
            <div>
              <p className="mb-2 text-xs font-medium text-gray-500">{t("label_system_permissions")}</p>
              <PermCheckboxes />
            </div>
            <SubmitButton className="w-full rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
              {t("btn_add_role")}
            </SubmitButton>
          </form>
        </section>

        <section className="rounded-xl bg-gray-50 p-3 text-xs text-gray-500">
          <p className="font-medium text-gray-600 mb-1.5">{t("perm_guide_title")}</p>
          <ul className="space-y-1">
            <li><span className="font-medium text-gray-700">WAITER</span> — take orders, manage tables</li>
            <li><span className="font-medium text-gray-700">KITCHEN</span> — view/update kitchen display</li>
            <li><span className="font-medium text-gray-700">CASHIER</span> — process payments &amp; shifts</li>
            <li><span className="font-medium text-gray-700">MANAGER</span> — live attendance &amp; approvals</li>
            <li><span className="font-medium text-gray-700">HR</span> — payroll, leave, employee records</li>
            <li><span className="font-medium text-gray-700">ADMIN</span> — all settings, full access</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
