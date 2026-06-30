import Link from "next/link";
import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import SubmitButton from "@/components/SubmitButton";
import { ALL_ROLES } from "@/lib/rbac";
import { getT } from "@/lib/lang";
import {
  createSystemAccount,
  toggleSystemAccountActive,
  resetSystemAccountPassword,
} from "./actions";

export const dynamic = "force-dynamic";

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; error?: string }>;
}) {
  await requireAnyRole(["HR", "ADMIN"]);
  const { tab = "active", error } = await searchParams;
  const t = await getT();

  const [activeEmps, , systemAccounts] = await Promise.all([
    tab === "active" || tab === "inactive"
      ? prisma.employee.findMany({
          where: { isActive: tab === "active" },
          include: { user: { select: { id: true, name: true, username: true, roles: true } } },
          orderBy: { user: { name: "asc" } },
        })
      : Promise.resolve([]),
    Promise.resolve([]) as Promise<unknown[]>,
    tab === "system"
      ? prisma.user.findMany({
          where: { isSystemAccount: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, username: true, roles: true, isActive: true },
        })
      : Promise.resolve([]),
  ]);

  const employees = tab === "active" || tab === "inactive" ? activeEmps : [];
  const sysAccounts =
    tab === "system"
      ? (systemAccounts as {
          id: string;
          name: string;
          username: string;
          roles: string[];
          isActive: boolean;
        }[])
      : [];

  const tabs = [
    { key: "active", label: t("tab_active") },
    { key: "inactive", label: t("tab_inactive") },
    { key: "system", label: t("tab_system_accounts") },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t("heading_employees")}</h1>
        {tab !== "system" && (
          <Link href="/hr/employees/new" className="btn-brand">{t("btn_onboard_employee")}</Link>
        )}
      </div>

      <div className="flex gap-1 rounded-xl bg-gray-100 p-1 w-fit">
        {tabs.map((tabItem) => (
          <Link
            key={tabItem.key}
            href={`/hr/employees?tab=${tabItem.key}`}
            className={
              "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors " +
              (tab === tabItem.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700")
            }
          >
            {tabItem.label}
          </Link>
        ))}
      </div>

      {(tab === "active" || tab === "inactive") && (
        <div className="rounded-xl border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">{t("col_no")}</th>
                <th className="px-4 py-2">{t("col_name")}</th>
                <th className="px-4 py-2">{t("col_roles")}</th>
                <th className="px-4 py-2">{t("col_basic_salary")}</th>
                <th className="px-4 py-2">{t("col_rest_days")}</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {employees.map((e) => (
                <tr key={e.userId} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-400">{e.employeeNo ?? "—"}</td>
                  <td className="px-4 py-2 font-medium">
                    <span>{e.user.name}</span>
                    {e.isSystem && (
                      <span className="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">
                        {t("badge_system")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-500">{e.user.roles.join(", ")}</td>
                  <td className="px-4 py-2">{e.basicSalary.toLocaleString()} MMK</td>
                  <td className="px-4 py-2 text-gray-500">
                    {e.restDays.map((d) => DAY[d]).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-2">
                    <Link href={`/hr/employees/${e.userId}`} className="text-xs text-brand hover:underline">
                      {t("btn_view_report")}
                    </Link>
                  </td>
                </tr>
              ))}
              {employees.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    {t("empty_no_employees")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "system" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-xl border bg-white shadow-sm">
            {error === "missing" && (
              <p className="px-4 pt-3 text-sm text-red-600">{t("error_missing_sys_account_fields")}</p>
            )}
            {error === "exists" && (
              <p className="px-4 pt-3 text-sm text-red-600">{t("error_username_already_taken")}</p>
            )}
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2">{t("col_name")}</th>
                  <th className="px-4 py-2">{t("label_username_onboard")}</th>
                  <th className="px-4 py-2">{t("col_roles")}</th>
                  <th className="px-4 py-2">{t("col_status")}</th>
                  <th className="px-4 py-2">{t("col_actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sysAccounts.map((u) => (
                  <tr key={u.id} className={u.isActive ? "" : "opacity-60"}>
                    <td className="px-4 py-2 font-medium">{u.name}</td>
                    <td className="px-4 py-2 text-gray-500 font-mono text-xs">{u.username}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{u.roles.join(", ") || "—"}</td>
                    <td className="px-4 py-2">
                      <span className={`badge ${u.isActive ? "badge-green" : "badge-gray"}`}>
                        {u.isActive ? t("tab_active") : t("tab_inactive")}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <form action={toggleSystemAccountActive}>
                          <input type="hidden" name="id" value={u.id} />
                          <button className="text-xs text-gray-500 hover:underline">
                            {u.isActive ? t("btn_deactivate") : t("btn_reactivate")}
                          </button>
                        </form>
                        <ResetPasswordInline id={u.id} labelReset={t("btn_reset_pw_short")} labelSet={t("btn_set")} labelPwPlaceholder={t("placeholder_new_password")} />
                      </div>
                    </td>
                  </tr>
                ))}
                {sysAccounts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                      {t("empty_no_employees")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border bg-white p-4 shadow-sm space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">{t("label_add_system_account")}</h2>
            <form action={createSystemAccount} className="space-y-3 text-sm">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">{t("label_display_name")}</label>
                <input name="name" required placeholder="e.g. POS Terminal"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">{t("label_username_onboard")}</label>
                <input name="username" required placeholder="e.g. pos_terminal"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">{t("label_password")}</label>
                <input name="password" type="password" required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">{t("col_roles")}</label>
                <div className="space-y-1">
                  {ALL_ROLES.map((r) => (
                    <label key={r} className="flex items-center gap-2 text-xs">
                      <input type="checkbox" name="roles" value={r} className="rounded" />
                      {r}
                    </label>
                  ))}
                </div>
              </div>
              <SubmitButton className="w-full rounded-lg bg-brand py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
                {t("btn_create")}
              </SubmitButton>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function ResetPasswordInline({ id, labelReset, labelSet, labelPwPlaceholder }: {
  id: string; labelReset: string; labelSet: string; labelPwPlaceholder: string;
}) {
  async function doReset(fd: FormData) {
    "use server";
    await resetSystemAccountPassword(fd);
  }
  return (
    <details className="inline">
      <summary className="text-xs text-brand hover:underline cursor-pointer list-none">{labelReset}</summary>
      <form action={doReset} className="mt-1 flex items-center gap-1">
        <input type="hidden" name="id" value={id} />
        <input name="password" type="password" placeholder={labelPwPlaceholder}
          className="rounded border border-gray-300 px-2 py-0.5 text-xs w-28" required />
        <SubmitButton className="text-xs text-white bg-brand rounded px-2 py-0.5 disabled:opacity-50">
          {labelSet}
        </SubmitButton>
      </form>
    </details>
  );
}
