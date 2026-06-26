import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { toggleEmployeeActive, resetEmployeePassword, toggleEmployeeSystem, deleteEmployee } from "../actions";
import DeleteEmployeeButton from "./DeleteEmployeeButton";
import SubmitButton from "@/components/SubmitButton";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function EmployeeProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">{emp.user.name}</h1>
          {emp.isSystem && (
            <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700">System</span>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href={`/hr/employees/${emp.userId}/edit`} className="btn-outline">Edit</Link>
          <Link href={`/hr/employees/${emp.userId}/documents`} className="btn-outline">Documents</Link>
          <form action={toggleEmployeeSystem}>
            <input type="hidden" name="userId" value={emp.userId} />
            <button type="submit" className="btn-outline text-purple-600">
              {emp.isSystem ? "Unmark System" : "Mark as System"}
            </button>
          </form>
          <form action={toggleEmployeeActive}>
            <input type="hidden" name="userId" value={emp.userId} />
            <button type="submit" className={emp.isActive ? "btn-outline text-red-600" : "btn-outline text-green-600"}>
              {emp.isActive ? "Deactivate" : "Activate"}
            </button>
          </form>
          <DeleteEmployeeButton userId={emp.userId} name={emp.user.name} />
        </div>
      </div>

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 text-sm">
          {[
            ["Employee No.", emp.employeeNo ?? "—"],
            ["Username", emp.user.username],
            ["Role", emp.staffRole?.name ?? "—"],
            ["Permissions", emp.user.roles.join(", ")],
            ["Status", emp.isActive ? "Active" : "Inactive"],
            ["Start Date", formatDate(emp.startDate)],
            ["Date of Birth", formatDate(emp.dateOfBirth)],
            ["Phone", emp.phone ?? "—"],
            ["Address", emp.address ?? "—"],
            ["Emergency Contact", emp.emergencyContact ?? "—"],
            ["Bank Account", emp.bankAccount ?? "—"],
            ["Basic Salary", `${emp.basicSalary.toLocaleString()} MMK`],
            ["Attendance Bonus", `${emp.attendanceBonus.toLocaleString()} MMK`],
            ["Rest Days", emp.restDays.map((d) => DAYS[d]).join(", ") || "—"],
          ].map(([label, value]) => (
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
          <h2 className="mb-2 font-semibold text-sm">Documents ({emp.documents.length})</h2>
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
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Account security</h2>
        <form action={resetEmployeePassword} className="flex items-center gap-2">
          <input type="hidden" name="userId" value={emp.userId} />
          <input
            name="password"
            type="password"
            placeholder="New password"
            className="input flex-1"
            required
          />
          <SubmitButton className="btn-outline disabled:opacity-60">
            Reset password
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
