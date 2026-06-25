import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default async function MyPayslipsPage() {
  const session = await requireSession();

  const employee = await prisma.employee.findUnique({
    where: { userId: session.id },
    include: { user: { select: { name: true } } },
  });

  if (!employee) {
    return (
      <div className="rounded-xl border bg-white p-10 text-center text-gray-400">
        No employee record linked to your account. Contact HR.
      </div>
    );
  }

  const payrollItems = await prisma.payrollItem.findMany({
    where: { employeeId: session.id },
    include: { payroll: true },
    orderBy: [{ payroll: { year: "desc" } }, { payroll: { month: "desc" } }],
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">My Payslips</h1>

      {payrollItems.length > 0 ? (
        <div className="rounded-xl border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left">Period</th>
                <th className="px-4 py-2 text-right">Net Pay</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {payrollItems.map((item) => {
                const slug = `${item.payroll.year}-${String(item.payroll.month).padStart(2, "0")}`;
                return (
                  <tr key={item.id}>
                    <td className="px-4 py-2 font-medium">
                      {MONTHS[item.payroll.month - 1]} {item.payroll.year}
                    </td>
                    <td className="px-4 py-2 text-right font-bold">{item.netPay.toLocaleString()} MMK</td>
                    <td className="px-4 py-2">
                      <span className={`badge ${item.payroll.status === "LOCKED" ? "badge-green" : "badge-gray"}`}>
                        {item.payroll.status === "LOCKED" ? "Approved" : "Draft"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link href={`/hr/payroll/${slug}/slip/${session.id}`}
                        className="text-sm text-brand hover:underline">
                        View →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-xl border bg-white p-8 text-center text-sm text-gray-400">
          No payslips yet for your account.
        </p>
      )}
    </div>
  );
}
