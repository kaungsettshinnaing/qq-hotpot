import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { createAdvance, addInstalment, deleteInstalment } from "./actions";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default async function AdvancesPage() {
  const now = new Date();

  const [employees, advances] = await Promise.all([
    prisma.employee.findMany({
      where: { isActive: true },
      include: { user: { select: { name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.salaryAdvance.findMany({
      include: {
        employee: { include: { user: { select: { name: true } } } },
        instalments: { orderBy: [{ year: "asc" }, { month: "asc" }] },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Salary Advances</h1>

      {/* Create */}
      <form action={createAdvance} className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-semibold text-sm">New Advance</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">Employee</label>
            <select name="employeeId" required className="input">
              <option value="">Select…</option>
              {employees.map((e) => <option key={e.userId} value={e.userId}>{e.user.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Total Amount (MMK)</label>
            <input name="totalAmount" type="number" min="1" required className="input" />
          </div>
          <div>
            <label className="label">Note</label>
            <input name="note" className="input" />
          </div>
        </div>
        <button type="submit" className="btn-brand mt-3">Create Advance</button>
      </form>

      {/* List */}
      <div className="space-y-4">
        {advances.map((adv) => {
          const totalDeducted = adv.instalments.filter((i) => i.deducted).reduce((s, i) => s + i.amount, 0);
          const totalScheduled = adv.instalments.reduce((s, i) => s + i.amount, 0);
          const remaining = adv.totalAmount - totalDeducted;
          return (
            <div key={adv.id} className="rounded-xl border bg-white shadow-sm">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div>
                  <span className="font-semibold">{adv.employee.user.name}</span>
                  <span className="ml-3 text-sm text-gray-500">
                    Total: {adv.totalAmount.toLocaleString()} MMK | Remaining: {remaining.toLocaleString()} MMK
                  </span>
                  {adv.note && <span className="ml-3 text-xs text-gray-400">({adv.note})</span>}
                </div>
                <span className="text-xs text-gray-400">{formatDate(adv.createdAt)}</span>
              </div>

              {/* Instalments */}
              <div className="divide-y px-4 py-2">
                {adv.instalments.map((inst) => (
                  <div key={inst.id} className="flex items-center justify-between py-1.5 text-sm">
                    <span>{MONTHS[inst.month - 1]} {inst.year} — {inst.amount.toLocaleString()} MMK</span>
                    <div className="flex items-center gap-3">
                      {inst.deducted ? (
                        <span className="badge badge-green text-xs">Deducted</span>
                      ) : (
                        <form action={deleteInstalment}>
                          <input type="hidden" name="id" value={inst.id} />
                          <button type="submit" className="text-xs text-red-500 hover:underline">Remove</button>
                        </form>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Add instalment */}
              {remaining > 0 && (
                <form action={addInstalment} className="flex gap-2 border-t px-4 py-3">
                  <input type="hidden" name="advanceId" value={adv.id} />
                  <select name="month" className="input text-sm">
                    {MONTHS.map((m, i) => (
                      <option key={i} value={i + 1} selected={i + 1 === now.getMonth() + 1}>{m}</option>
                    ))}
                  </select>
                  <input name="year" type="number" className="input text-sm w-24" defaultValue={now.getFullYear()} />
                  <input name="amount" type="number" min="1" max={remaining} className="input text-sm" placeholder="Amount" />
                  <button type="submit" className="btn-brand text-sm">Add</button>
                </form>
              )}
            </div>
          );
        })}
        {advances.length === 0 && (
          <p className="rounded-xl border bg-white p-6 text-center text-sm text-gray-400">No salary advances</p>
        )}
      </div>
    </div>
  );
}
