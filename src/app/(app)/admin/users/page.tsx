import Link from "next/link";
import { prisma } from "@/lib/db";
import { ALL_ROLES } from "@/lib/rbac";
import SubmitButton from "@/components/SubmitButton";
import { updateUserRoles, setUserActive, resetUserPassword } from "../actions";

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

export default async function AdminUsersPage() {
  const users = await prisma.user.findMany({
    orderBy: { name: "asc" },
    include: { employee: { select: { employeeNo: true } } },
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Manage roles for each user. To create a new staff account, go to{" "}
          <Link href="/hr/employees/new" className="text-brand hover:underline font-medium">
            HR → New Employee
          </Link>.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {users.map((u) => (
          <div
            key={u.id}
            className={
              "rounded-2xl border bg-white p-4 shadow-sm flex flex-col gap-3 " +
              (!u.isActive ? "opacity-60" : "")
            }
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-gray-900">{u.name}</p>
                <p className="text-xs text-gray-400">@{u.username}</p>
                {u.employee?.employeeNo && (
                  <p className="text-xs text-gray-400">{(u as any).employee.employeeNo}</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold " +
                  (u.isActive ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500")
                }>
                  {u.isActive ? "Active" : "Inactive"}
                </span>
              </div>
            </div>

            {/* Current roles (pill badges) */}
            {(u.roles as string[]).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {(u.roles as string[]).map((r) => (
                  <span
                    key={r}
                    className={
                      "rounded-full border px-2 py-0.5 text-[11px] font-medium " +
                      (ROLE_COLORS[r] ?? "bg-gray-50 text-gray-600 border-gray-200")
                    }
                  >
                    {r}
                  </span>
                ))}
              </div>
            )}

            {/* Role checkboxes */}
            <form action={updateUserRoles} className="space-y-2">
              <input type="hidden" name="id" value={u.id} />
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                {ALL_ROLES.map((r) => (
                  <label key={r} className="flex items-center gap-1.5 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      name={`role_${r}`}
                      defaultChecked={(u.roles as string[]).includes(r)}
                      className="accent-brand"
                    />
                    {r}
                  </label>
                ))}
              </div>
              <SubmitButton className="w-full rounded-lg bg-brand py-1.5 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
                Save roles
              </SubmitButton>
            </form>

            {/* Footer actions */}
            <div className="flex items-center gap-2 border-t pt-2">
              <form action={setUserActive} className="flex-none">
                <input type="hidden" name="id" value={u.id} />
                <button className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">
                  {u.isActive ? "Deactivate" : "Activate"}
                </button>
              </form>
              <form action={resetUserPassword} className="flex flex-1 items-center gap-1 min-w-0">
                <input type="hidden" name="id" value={u.id} />
                <input
                  name="password"
                  placeholder="New password"
                  className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2 py-1 text-xs"
                />
                <SubmitButton className="flex-none rounded-lg border border-gray-200 px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-60">
                  Reset
                </SubmitButton>
              </form>
            </div>
          </div>
        ))}

        {users.length === 0 && (
          <p className="col-span-full text-sm text-gray-400">No users yet.</p>
        )}
      </div>
    </div>
  );
}
