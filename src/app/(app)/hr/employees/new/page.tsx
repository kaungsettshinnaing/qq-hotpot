import { prisma } from "@/lib/db";
import { createEmployee } from "../actions";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function NewEmployeePage() {
  // Only users without an existing Employee record
  const linked = await prisma.employee.findMany({ select: { userId: true } });
  const linkedIds = new Set(linked.map((e) => e.userId));
  const users = await prisma.user.findMany({
    where: { isActive: true, id: { notIn: [...linkedIds] } },
    select: { id: true, name: true, username: true, roles: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">Onboard New Employee</h1>
      <form action={createEmployee} className="space-y-4 rounded-xl border bg-white p-6 shadow-sm">
        <div>
          <label className="label">Link to existing user account</label>
          <select name="userId" required className="input">
            <option value="">Select a user…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.username}) — {u.roles.join(", ")}
              </option>
            ))}
          </select>
        </div>
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
