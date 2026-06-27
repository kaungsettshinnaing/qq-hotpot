import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_FULL  = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function nextRestDays(restDayNums: number[], count: number): Date[] {
  const results: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cursor = new Date(today);
  cursor.setDate(cursor.getDate() + 1); // start from tomorrow
  while (results.length < count) {
    if (restDayNums.includes(cursor.getDay())) results.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return results;
}

function fmtRestDay(d: Date) {
  return `${DAY_FULL[d.getDay()]}, ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}

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

  const restDayNums = employee?.restDays ?? [];
  const restDayNames = restDayNums.map((d) => DAY_SHORT[d]);
  const upcomingRestDays = restDayNums.length > 0 ? nextRestDays(restDayNums, 5) : [];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Leave &amp; Rest Days</h1>
        <Link href="/my-account/leave/new" className="btn-brand">Request Leave</Link>
      </div>

      {/* ── Rest Days (Paid) ── */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-base font-bold text-gray-800">Rest Days</h2>
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
            Paid
          </span>
        </div>

        {restDayNums.length === 0 ? (
          <p className="text-sm text-gray-400">No rest days assigned. Contact HR.</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-gray-500">
              Your weekly off: <span className="font-semibold text-gray-700">{restDayNames.join(", ")}</span>
              <span className="ml-1 text-xs text-gray-400">— no leave request needed</span>
            </p>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
              {upcomingRestDays.map((d, i) => (
                <div
                  key={i}
                  className={`rounded-xl border bg-white px-4 py-3 shadow-sm ${i === 0 ? "border-emerald-300 bg-emerald-50" : "border-gray-100"}`}
                >
                  <div className={`text-xs font-semibold uppercase tracking-wide ${i === 0 ? "text-emerald-600" : "text-gray-400"}`}>
                    {i === 0 ? "Next" : `+${i}`}
                  </div>
                  <div className={`mt-1 text-xl font-extrabold tabular-nums ${i === 0 ? "text-emerald-800" : "text-gray-700"}`}>
                    {d.getDate()} {MONTH_SHORT[d.getMonth()]}
                  </div>
                  <div className={`text-xs mt-0.5 ${i === 0 ? "text-emerald-600" : "text-gray-400"}`}>
                    {DAY_SHORT[d.getDay()]}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* ── Leave Requests (Unpaid) ── */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-base font-bold text-gray-800">Leave Requests</h2>
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
            Unpaid
          </span>
        </div>

        {requests.length === 0 ? (
          <div className="rounded-xl border bg-white p-8 text-center text-sm text-gray-400">
            No leave requests yet.{" "}
            <Link href="/my-account/leave/new" className="text-brand hover:underline">
              Submit your first one.
            </Link>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="space-y-2 sm:hidden">
              {requests.map((r) => {
                const sameDay = r.startDate.toDateString() === r.endDate.toDateString();
                const dateDisplay = sameDay
                  ? formatDate(r.startDate)
                  : `${formatDate(r.startDate)} – ${formatDate(r.endDate)}`;
                return (
                  <div key={r.id} className="rounded-xl border bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold text-sm text-gray-800">{dateDisplay}</div>
                        <div className="mt-0.5 text-xs text-gray-500">{r.reason ?? "No reason given"}</div>
                      </div>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ml-2 flex-shrink-0 ${
                        r.status === "APPROVED" ? "bg-emerald-100 text-emerald-700"
                        : r.status === "REJECTED" ? "bg-red-100 text-red-700"
                        : "bg-gray-100 text-gray-600"
                      }`}>
                        {r.status}
                      </span>
                    </div>
                    {r.reviewedBy && (
                      <div className="mt-1.5 text-xs text-gray-400">Reviewed by {r.reviewedBy.name}</div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden sm:block rounded-xl border bg-white shadow-sm overflow-x-auto">
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
                        <td className="px-4 py-2.5 font-medium">{dateDisplay}</td>
                        <td className="px-4 py-2.5 text-gray-500">{r.reason ?? "—"}</td>
                        <td className="px-4 py-2.5">
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            r.status === "APPROVED" ? "bg-emerald-100 text-emerald-700"
                            : r.status === "REJECTED" ? "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-600"
                          }`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-500">{r.reviewedBy?.name ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
