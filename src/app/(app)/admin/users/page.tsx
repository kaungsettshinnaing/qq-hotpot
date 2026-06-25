import { prisma } from "@/lib/db";
import { ALL_ROLES } from "@/lib/rbac";
import SubmitButton from "@/components/SubmitButton";
import {
  createUser,
  updateUserRoles,
  setUserActive,
  resetUserPassword,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const users = await prisma.user.findMany({ orderBy: { username: "asc" } });

  return (
    <div className="space-y-5">
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error === "exists" ? "That username already exists." : "Please fill all required fields."}
        </p>
      )}

      {/* Add user */}
      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">Add user</h3>
        <form action={createUser} className="space-y-3 text-sm">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            <input
              name="name"
              required
              placeholder="Full name"
              className="rounded-lg border border-gray-300 px-3 py-2"
            />
            <input
              name="username"
              required
              placeholder="Username"
              className="rounded-lg border border-gray-300 px-3 py-2"
            />
            <input
              name="password"
              required
              placeholder="Password"
              className="rounded-lg border border-gray-300 px-3 py-2"
            />
            <input
              name="pin"
              placeholder="Manager PIN (optional)"
              className="rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            {ALL_ROLES.map((r) => (
              <label key={r} className="flex items-center gap-1 text-xs">
                <input type="checkbox" name={`role_${r}`} /> {r}
              </label>
            ))}
          </div>
          <SubmitButton className="rounded-lg bg-brand px-5 py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
            Create user
          </SubmitButton>
        </form>
      </section>

      {/* Users list */}
      <section className="space-y-3">
        {users.map((u) => (
          <div key={u.id} className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-semibold">{u.name}</span>
                <span className="ml-2 text-sm text-gray-400">@{u.username}</span>
                {!u.isActive && (
                  <span className="ml-2 rounded bg-gray-200 px-1.5 text-xs text-gray-500">
                    inactive
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <form action={setUserActive}>
                  <input type="hidden" name="id" value={u.id} />
                  <button className="rounded-lg border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50">
                    {u.isActive ? "Deactivate" : "Activate"}
                  </button>
                </form>
              </div>
            </div>

            <form action={updateUserRoles} className="mt-3 flex flex-wrap items-center gap-3">
              <input type="hidden" name="id" value={u.id} />
              {ALL_ROLES.map((r) => (
                <label key={r} className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    name={`role_${r}`}
                    defaultChecked={(u.roles as string[]).includes(r)}
                  />
                  {r}
                </label>
              ))}
              <SubmitButton className="rounded-lg bg-gray-800 px-3 py-1 text-xs font-medium text-white hover:bg-gray-900 disabled:opacity-60">
                Save roles
              </SubmitButton>
            </form>

            <form action={resetUserPassword} className="mt-2 flex items-center gap-2">
              <input type="hidden" name="id" value={u.id} />
              <input
                name="password"
                placeholder="New password"
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs"
              />
              <SubmitButton className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50">
                Reset password
              </SubmitButton>
            </form>
          </div>
        ))}
      </section>
    </div>
  );
}
