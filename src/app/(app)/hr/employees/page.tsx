import Link from "next/link";
import { prisma } from "@/lib/db";

export default async function EmployeesPage() {
  const employees = await prisma.employee.findMany({
    include: { user: { select: { id: true, name: true, username: true, roles: true } } },
    orderBy: { user: { name: "asc" } },
  });

  // Users without an Employee profile (candidates for onboarding)
  const linkedIds = new Set(employees.map((e) => e.userId));
  const unlinked = await prisma.user.findMany({
    where: { isActive: true, id: { notIn: [...linkedIds] } },
    select: { id: true, name: true, username: true },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Employees</h1>
        {unlinked.length > 0 && (
          <Link href="/hr/employees/new" className="btn-brand">+ Onboard Employee</Link>
        )}
      </div>

      <div className="rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">No.</th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Roles</th>
              <th className="px-4 py-2">Basic Salary</th>
              <th className="px-4 py-2">Rest Days</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {employees.map((e) => (
              <tr key={e.userId} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-400">{e.employeeNo ?? "—"}</td>
                <td className="px-4 py-2 font-medium">{e.user.name}</td>
                <td className="px-4 py-2 text-gray-500">{e.user.roles.join(", ")}</td>
                <td className="px-4 py-2">{e.basicSalary.toLocaleString()} MMK</td>
                <td className="px-4 py-2 text-gray-500">
                  {e.restDays.map((d) => ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d]).join(", ") || "—"}
                </td>
                <td className="px-4 py-2">
                  <span className={`badge ${e.isActive ? "badge-green" : "badge-gray"}`}>
                    {e.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <Link href={`/hr/employees/${e.userId}`} className="text-xs text-brand hover:underline">
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {employees.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No employees yet. Onboard one above.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
