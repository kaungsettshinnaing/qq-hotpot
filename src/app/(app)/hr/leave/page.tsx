import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { hrReviewLeave, hrMarkAbsence } from "./actions";

export default async function HRLeavePage() {
  const now = new Date();

  const [pending, recent, employees] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { status: "PENDING" },
      include: { employee: { include: { user: { select: { name: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.leaveRequest.findMany({
      where: { status: { not: "PENDING" } },
      include: {
        employee: { include: { user: { select: { name: true } } } },
        reviewedBy: { select: { name: true } },
      },
      orderBy: { reviewedAt: "desc" },
      take: 30,
    }),
    prisma.employee.findMany({
      where: { isActive: true },
      include: { user: { select: { name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Leave Management</h1>

      {/* Pending */}
      {pending.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold text-sm">Pending Requests ({pending.length})</h2>
          {pending.map((r) => (
            <div key={r.id} className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <span className="font-medium">{r.employee.user.name}</span>
                  <span className="ml-2 text-sm text-gray-500">
                    {formatDate(r.startDate)} – {formatDate(r.endDate)}
                  </span>
                  {r.reason && <p className="mt-1 text-sm text-gray-600">"{r.reason}"</p>}
                </div>
                <div className="flex gap-2">
                  <form action={hrReviewLeave}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="action" value="approve" />
                    <button type="submit" className="rounded-lg bg-green-600 px-3 py-1 text-sm text-white">Approve</button>
                  </form>
                  <form action={hrReviewLeave}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="action" value="reject" />
                    <button type="submit" className="rounded-lg bg-red-600 px-3 py-1 text-sm text-white">Reject</button>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Mark absence directly */}
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-semibold text-sm">Mark Absence Directly</h2>
        <form action={hrMarkAbsence} className="grid gap-3 sm:grid-cols-4">
          <select name="employeeId" required className="input">
            <option value="">Employee…</option>
            {employees.map((e) => <option key={e.userId} value={e.userId}>{e.user.name}</option>)}
          </select>
          <input name="date" type="date" required className="input" defaultValue={now.toISOString().slice(0, 10)} />
          <select name="status" className="input">
            <option value="ABSENT">Absent (unauthorised)</option>
            <option value="LEAVE">Leave (authorised)</option>
          </select>
          <button type="submit" className="btn-brand">Mark</button>
        </form>
      </div>

      {/* Recent */}
      {recent.length > 0 && (
        <div>
          <h2 className="mb-2 font-semibold text-sm">Recent Decisions</h2>
          <div className="rounded-xl border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left">Employee</th>
                  <th className="px-4 py-2 text-left">Dates</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Reviewed By</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2">{r.employee.user.name}</td>
                    <td className="px-4 py-2 text-gray-500">
                      {formatDate(r.startDate)} – {formatDate(r.endDate)}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`badge ${r.status === "APPROVED" ? "badge-green" : "badge-red"}`}>{r.status}</span>
                    </td>
                    <td className="px-4 py-2 text-gray-500">{r.reviewedBy?.name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
