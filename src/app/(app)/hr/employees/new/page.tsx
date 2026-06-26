import Link from "next/link";
import { prisma } from "@/lib/db";
import { createEmployee } from "../actions";
import { ALL_ROLES } from "@/lib/rbac";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function NewEmployeePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  const isLinkMode = mode === "link";

  // For link mode: users without an existing Employee record
  const existing = isLinkMode
    ? await (async () => {
        const linked = await prisma.employee.findMany({ select: { userId: true } });
        const linkedIds = new Set(linked.map((e) => e.userId));
        return prisma.user.findMany({
          where: { isActive: true, id: { notIn: [...linkedIds] } },
          select: { id: true, name: true, username: true, roles: true },
          orderBy: { name: "asc" },
        });
      })()
    : [];

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">
          {isLinkMode ? "Link Existing Account" : "New Employee"}
        </h1>
        <Link
          href={isLinkMode ? "/hr/employees/new" : "/hr/employees/new?mode=link"}
          className="text-sm text-brand hover:underline"
        >
          {isLinkMode ? "← Create new account instead" : "Link existing account →"}
        </Link>
      </div>

      <form action={createEmployee} className="space-y-4 rounded-xl border bg-white p-6 shadow-sm">
        <input type="hidden" name="accountMode" value={isLinkMode ? "link" : "create"} />

        {isLinkMode ? (
          /* Link to existing user */
          <div>
            <label className="label">Existing user account</label>
            <select name="userId" required className="input">
              <option value="">Select a user…</option>
              {existing.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} (@{u.username}) — {(u.roles as string[]).join(", ")}
                </option>
              ))}
            </select>
          </div>
        ) : (
          /* Create new user + employee */
          <div className="space-y-3 rounded-lg border border-brand/20 bg-brand/5 p-4">
            <h2 className="text-sm font-semibold text-brand">User account (login credentials)</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Full Name *</label>
                <input name="name" required className="input" placeholder="e.g. Ko Aung" />
              </div>
              <div>
                <label className="label">Username *</label>
                <input name="username" required className="input" placeholder="e.g. ko_aung" />
              </div>
              <div>
                <label className="label">Password *</label>
                <input name="password" required type="password" className="input" placeholder="••••••••" />
              </div>
              <div>
                <label className="label">Manager PIN (optional)</label>
                <input name="pin" className="input" placeholder="4–6 digits" />
              </div>
            </div>
            <div>
              <label className="label mb-1">Roles</label>
              <div className="flex flex-wrap gap-3 pt-1">
                {ALL_ROLES.map((r) => (
                  <label key={r} className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" name={`role_${r}`} className="accent-brand" />
                    {r}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Employee details */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Employee No.</label>
            <input name="employeeNo" className="input" placeholder="EMP001" />
          </div>
          <div>
            <label className="label">Start Date *</label>
            <input name="startDate" type="date" required className="input" />
          </div>
          <div>
            <label className="label">Date of Birth</label>
            <input name="dateOfBirth" type="date" className="input" />
          </div>
          <div>
            <label className="label">Phone</label>
            <input name="phone" className="input" />
          </div>
          <div>
            <label className="label">Basic Salary (MMK)</label>
            <input name="basicSalary" type="number" min="0" className="input" defaultValue="0" />
          </div>
          <div>
            <label className="label">Attendance Bonus (MMK, perfect month)</label>
            <input name="attendanceBonus" type="number" min="0" className="input" defaultValue="0" />
          </div>
        </div>
        <div>
          <label className="label">Address</label>
          <input name="address" className="input" />
        </div>
        <div>
          <label className="label">Emergency Contact</label>
          <input name="emergencyContact" className="input" />
        </div>
        <div>
          <label className="label">Bank Account</label>
          <input name="bankAccount" className="input" />
        </div>
        <div>
          <label className="label">Rest Days (weekly off)</label>
          <div className="flex flex-wrap gap-3 pt-1">
            {DAYS.map((d, i) => (
              <label key={i} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" name="restDays" value={i} />
                {d}
              </label>
            ))}
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <button type="submit" className="btn-brand">Create Employee</button>
          <a href="/hr/employees" className="btn-outline">Cancel</a>
        </div>
      </form>
    </div>
  );
}
