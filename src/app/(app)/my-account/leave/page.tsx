import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function MyLeavePage() {
  const session = await requireSession();

  const [employee, requests] = await Promise.all([
    prisma.employee.findUnique({
      where: { userId: session.id },
      select: { restDays: true },
    }),
    prisma.leaveRequest.findMany({
      where: { employeeId: session.id },
      include: { reviewedBy: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const restDayNames = employee?.restDays.map((d) => DAY[d]) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">My Leave</h1>
        <Link href="/my-account/leave/new" className="btn-brand">Request Leave</Link>
      </div>

      {restDayNames.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-600">
          Your rest days: <span className="font-medium">{restDayNames.join(", ")}</span>
          <span className="ml-1 text-xs text-gray-400">(no need to request leave for these)</span>
        </div>
      )}

      {requests.length > 0 ? (
        <div className="rounded-xl border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-left">Reason</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Reviewed By</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {requests.map((r) => {
                const sameDay = r.startDate.toDateString() === r.endDate.toDateString();
                const dateDisplay = sameDay
                  ? formatDate(r.startDate)
                  : `${formatDate(r.startDate)} – ${formatDate(r.endDate)}`;
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-2">{dateDisplay}</td>
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
                );
              })}
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
