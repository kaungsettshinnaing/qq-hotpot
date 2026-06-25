import { prisma } from "@/lib/db";
import { createFine, deleteFine } from "./actions";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default async function FinesPage() {
  const now = new Date();
  const [employees, fines] = await Promise.all([
    prisma.employee.findMany({
      where: { isActive: true },
      include: { user: { select: { name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.employeeFine.findMany({
      include: { employee: { include: { user: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Fines</h1>

      <form action={createFine} className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-semibold text-sm">Add Fine</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="label">Employee</label>
            <select name="employeeId" required className="input">
              <option value="">Select…</option>
              {employees.map((e) => <option key={e.userId} value={e.userId}>{e.user.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Amount (MMK)</label>
            <input name="amount" type="number" min="1" required className="input" />
          </div>
          <div>
            <label className="label">Reason</label>
            <input name="reason" required className="input" />
          </div>
          <div>
            <label className="label">Deduct Month</label>
            <select name="deductMonth" className="input">
              {MONTHS.map((m, i) => <option key={i} value={i + 1} selected={i + 1 === now.getMonth() + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Year</label>
            <input name="deductYear" type="number" className="input" defaultValue={now.getFullYear()} />
          </div>
        </div>
        <button type="submit" className="btn-brand mt-3">Add Fine</button>
      </form>

      <div className="rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left">Employee</th>
              <th className="px-4 py-2 text-left">Amount</th>
              <th className="px-4 py-2 text-left">Reason</th>
              <th className="px-4 py-2 text-left">Deduct</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {fines.map((f) => (
              <tr key={f.id}>
                <td className="px-4 py-2">{f.employee.user.name}</td>
                <td className="px-4 py-2">{f.amount.toLocaleString()} MMK</td>
                <td className="px-4 py-2 text-gray-500">{f.reason}</td>
                <td className="px-4 py-2 text-gray-500">{MONTHS[f.deductMonth - 1]} {f.deductYear}</td>
                <td className="px-4 py-2">
                  <span className={`badge ${f.deducted ? "badge-green" : "badge-gray"}`}>
                    {f.deducted ? "Deducted" : "Pending"}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {!f.deducted && (
                    <form action={deleteFine}>
                      <input type="hidden" name="id" value={f.id} />
                      <button type="submit" className="text-xs text-red-500 hover:underline">Delete</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {fines.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">No fines</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
