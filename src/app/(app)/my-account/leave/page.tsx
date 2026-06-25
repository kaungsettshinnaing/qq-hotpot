import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function MyLeavePage() {
  const session = await requireSession();

  const requests = await prisma.leaveRequest.findMany({
    where: { employeeId: session.id },
    include: { reviewedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">My Leave</h1>
        <Link href="/my-account/leave/new" className="btn-brand">Request Leave</Link>
      </div>

      {requests.length > 0 ? (
        <div className="rounded-xl border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left">From</th>
                <th className="px-4 py-2 text-left">To</th>
                <th className="px-4 py-2 text-left">Reason</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Reviewed By</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {requests.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2">{r.startDate.toLocaleDateString()}</td>
                  <td className="px-4 py-2">{r.endDate.toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-gray-500">{r.reason ?? "—"}</td>
                  <td className="px-4 py-2">
                    <span className={`badge ${
                      r.status === "APPROVED" ? "badge-green"
                      : r.status === "REJECTED" ? "badge-red"
                      : "badge-gray"
                    }`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-2 text-gray-500">{r.reviewedBy?.name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border bg-white p-8 text-center text-sm text-gray-400">
          No leave requests yet.{" "}
          <Link href="/my-account/leave/new" className="text-brand hover:underline">Submit your first one.</Link>
        </div>
      )}
    </div>
  );
}
