import Link from "next/link";
import { prisma } from "@/lib/db";
import { createEmployee } from "../actions";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function NewEmployeePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; error?: string }>;
}) {
  const { mode, error } = await searchParams;
  const isLinkMode = mode === "link";

  const [staffRoles, existingUsers] = await Promise.all([
    prisma.staffRole.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    isLinkMode
      ? (async () => {
          const linked = await prisma.employee.findMany({ select: { userId: true } });
          const linkedIds = new Set(linked.map((e) => e.userId));
          return prisma.user.findMany({
            where: { isActive: true, id: { notIn: [...linkedIds] } },
            select: { id: true, name: true, username: true },
            orderBy: { name: "asc" },
          });
        })()
      : Promise.resolve([]),
  ]);

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

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error === "exists" ? "That username already exists." :
           error === "no-role" ? "Please select a role first (Admin → Roles)." :
           "Please fill all required fields."}
        </p>
      )}

      <form action={createEmployee} className="space-y-4 rounded-xl border bg-white p-6 shadow-sm">
        <input type="hidden" name="accountMode" value={isLinkMode ? "link" : "create"} />

        {isLinkMode ? (
          <div>
            <label className="label">Existing user account</label>
            <select name="userId" required className="input">
              <option value="">Select a user…</option>
              {existingUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} (@{u.username})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="space-y-3 rounded-lg border border-brand/20 bg-brand/5 p-4">
            <h2 className="text-sm font-semibold text-brand">Login credentials</h2>

            {staffRoles.length === 0 ? (
              <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                No roles configured yet.{" "}
                <Link href="/admin/roles" className="underline font-medium">
                  Set up roles in Admin → Roles
                </Link>{" "}
                first.
              </p>
            ) : (
              <div>
                <label className="label">Role *</label>
                <select name="staffRoleId" required className="input">
                  <option value="">Select role…</option>
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
                <label className="label">Full Name *</label>
                <input name="name" required className="input" placeholder="e.g. Ko Aung" />
              </div>
              <div>
                <label className="label">Username *</label>
                <input name="username" required className="input" placeholder="e.g. ko_aung" />
              </div>
            </div>
            <div>
              <label className="label">Password *</label>
              <input name="password" required type="password" className="input" placeholder="••••••••" />
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
