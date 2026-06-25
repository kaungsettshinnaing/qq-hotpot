import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { toggleEmployeeActive } from "../actions";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function EmployeeProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const emp = await prisma.employee.findUnique({
    where: { userId: id },
    include: {
      user: true,
      customValues: { include: { fieldDef: true } },
      documents: true,
    },
  });
  if (!emp) notFound();

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{emp.user.name}</h1>
        <div className="flex gap-2">
          <Link href={`/hr/employees/${emp.userId}/edit`} className="btn-outline">Edit</Link>
          <Link href={`/hr/employees/${emp.userId}/documents`} className="btn-outline">Documents</Link>
          <form action={toggleEmployeeActive}>
            <input type="hidden" name="userId" value={emp.userId} />
            <button type="submit" className={emp.isActive ? "btn-outline text-red-600" : "btn-outline text-green-600"}>
              {emp.isActive ? "Deactivate" : "Activate"}
            </button>
          </form>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 text-sm">
          {[
            ["Employee No.", emp.employeeNo ?? "—"],
            ["Username", emp.user.username],
            ["Roles", emp.user.roles.join(", ")],
            ["Status", emp.isActive ? "Active" : "Inactive"],
            ["Start Date", emp.startDate.toLocaleDateString()],
            ["Date of Birth", emp.dateOfBirth?.toLocaleDateString() ?? "—"],
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

        {emp.customValues.length > 0 && (
          <div className="mt-4 border-t pt-4 grid gap-3 sm:grid-cols-2 text-sm">
            {emp.customValues.map((v) => (
              <div key={v.id}>
                <div className="text-xs text-gray-400">{v.fieldDef.label}</div>
                <div className="font-medium">{v.value || "—"}</div>
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
                <span className="ml-2 text-xs text-gray-400">{d.uploadedAt.toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
