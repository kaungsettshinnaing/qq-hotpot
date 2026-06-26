import { prisma } from "@/lib/db";
import { createAdvance, deleteInstalment } from "./actions";

export const dynamic = "force-dynamic";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default async function AdvancesPage() {
  const now = new Date();

  const [employees, instalments] = await Promise.all([
    prisma.employee.findMany({
      where: { isActive: true },
      include: { user: { select: { name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.advanceInstalment.findMany({
      include: {
        advance: {
          include: { employee: { include: { user: { select: { name: true } } } } },
        },
      },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Salary Advances</h1>

      {/* Add advance form — same layout as fines */}
      <form action={createAdvance} className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-semibold text-sm">Add Advance</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="label">Employee</label>
            <select name="employeeId" required className="input">
              <option value="">Select…</option>
              {employees.map((e) => (
                <option key={e.userId} value={e.userId}>{e.user.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Amount (MMK)</label>
            <input name="amount" type="number" min="1" required className="input" />
          </div>
          <div>
            <label className="label">Note</label>
            <input name="note" className="input" />
          </div>
          <div>
            <label className="label">Deduct Month</label>
            <select name="month" className="input">
              {MONTHS.map((m, i) => (
                <option key={i} value={i + 1} selected={i === now.getMonth()}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Year</label>
            <input name="year" type="number" className="input" defaultValue={now.getFullYear()} />
          </div>
        </div>
        <button type="submit" className="btn-brand mt-3">Add Advance</button>
      </form>

      {/* Flat list — same layout as fines */}
      <div className="rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left">Employee</th>
              <th className="px-4 py-2 text-left">Amount</th>
              <th className="px-4 py-2 text-left">Note</th>
              <th className="px-4 py-2 text-left">Deduct</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {instalments.map((inst) => (
              <tr key={inst.id}>
                <td className="px-4 py-2 font-medium">{inst.advance.employee.user.name}</td>
                <td className="px-4 py-2">{inst.amount.toLocaleString()} MMK</td>
                <td className="px-4 py-2 text-gray-500">{inst.advance.note ?? "—"}</td>
                <td className="px-4 py-2 text-gray-500">
                  {MONTHS[inst.month - 1]} {inst.year}
                </td>
                <td className="px-4 py-2">
                  <span className={`badge ${inst.deducted ? "badge-green" : "badge-gray"}`}>
                    {inst.deducted ? "Deducted" : "Pending"}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {!inst.deducted && (
                    <form action={deleteInstalment}>
                      <input type="hidden" name="id" value={inst.id} />
                      <button type="submit" className="text-xs text-red-500 hover:underline">
                        Delete
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {instalments.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">No salary advances</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
