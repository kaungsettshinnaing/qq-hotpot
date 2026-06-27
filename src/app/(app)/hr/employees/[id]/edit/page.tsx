import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { updateEmployee } from "../../actions";

export const dynamic = "force-dynamic";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function EditEmployeePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const emp = await prisma.employee.findUnique({
    where: { userId: id },
    include: {
      user: true,
      customValues: { include: { fieldDef: true } },
    },
  });
  if (!emp) notFound();

  const fieldDefs = await prisma.employeeFieldDef.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  const valueMap = Object.fromEntries(emp.customValues.map((v) => [v.fieldDefId, v.value]));

  const errorMsg =
    error === "username-taken" ? "That username is already taken — choose another." :
    error === "missing-name"   ? "Full name is required." :
    error === "missing-username" ? "Username is required." : null;

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">Edit — {emp.user.name}</h1>

      {errorMsg && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      <form action={updateEmployee} className="space-y-4 rounded-xl border bg-white p-6 shadow-sm">
        <input type="hidden" name="userId" value={emp.userId} />

        {/* Account fields */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Full Name *</label>
            <input name="name" required className="input" defaultValue={emp.user.name} />
          </div>
          <div>
            <label className="label">Username *</label>
            <input name="username" required className="input" defaultValue={emp.user.username}
              autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          </div>
        </div>

        <div className="border-t pt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Employee No.</label>
            <input name="employeeNo" className="input" defaultValue={emp.employeeNo ?? ""} />
          </div>
          <div>
            <label className="label">Start Date * (DD-MMM-YYYY)</label>
            <input name="startDate" required className="input"
              defaultValue={formatDate(emp.startDate)} />
          </div>
          <div>
            <label className="label">Date of Birth (DD-MMM-YYYY)</label>
            <input name="dateOfBirth" className="input"
              defaultValue={emp.dateOfBirth ? formatDate(emp.dateOfBirth) : ""} />
          </div>
          <div>
            <label className="label">Phone</label>
            <input name="phone" className="input" defaultValue={emp.phone ?? ""} />
          </div>
          <div>
            <label className="label">Basic Salary (MMK)</label>
            <input name="basicSalary" type="number" min="0" className="input" defaultValue={emp.basicSalary} />
          </div>
          <div>
            <label className="label">Attendance Bonus (MMK)</label>
            <input name="attendanceBonus" type="number" min="0" className="input" defaultValue={emp.attendanceBonus} />
          </div>
        </div>
        <div>
          <label className="label">Address</label>
          <input name="address" className="input" defaultValue={emp.address ?? ""} />
        </div>
        <div>
          <label className="label">Emergency Contact</label>
          <input name="emergencyContact" className="input" defaultValue={emp.emergencyContact ?? ""} />
        </div>
        <div>
          <label className="label">Bank Account</label>
          <input name="bankAccount" className="input" defaultValue={emp.bankAccount ?? ""} />
        </div>
        <div>
          <label className="label">Rest Days</label>
          <div className="flex flex-wrap gap-3 pt-1">
            {DAYS.map((d, i) => (
              <label key={i} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" name="restDays" value={i} defaultChecked={emp.restDays.includes(i)} />
                {d}
              </label>
            ))}
          </div>
        </div>

        {fieldDefs.length > 0 && (
          <div className="border-t pt-4 space-y-3">
            <h3 className="font-semibold text-sm">Custom Fields</h3>
            {fieldDefs.map((def) => (
              <div key={def.id}>
                <label className="label">{def.label}{def.isRequired && " *"}</label>
                {def.fieldType === "DROPDOWN" ? (
                  <select name={`field_${def.id}`} className="input" defaultValue={valueMap[def.id] ?? ""}>
                    <option value="">—</option>
                    {def.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input
                    name={`field_${def.id}`}
                    type={def.fieldType === "NUMBER" ? "number" : def.fieldType === "DATE" ? "date" : "text"}
                    className="input"
                    defaultValue={valueMap[def.id] ?? ""}
                    required={def.isRequired}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button type="submit" className="btn-brand">Save Changes</button>
          <a href={`/hr/employees/${emp.userId}`} className="btn-outline">Cancel</a>
        </div>
      </form>
    </div>
  );
}
