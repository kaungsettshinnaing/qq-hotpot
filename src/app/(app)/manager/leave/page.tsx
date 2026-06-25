import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { notifyManagers } from "@/lib/notifications";

async function reviewLeave(fd: FormData) {
  "use server";
  const session = await requireAnyRole(["MANAGER", "ADMIN"]);
  const id = fd.get("id") as string;
  const action = fd.get("action") as "approve" | "reject";
  const status = action === "approve" ? "APPROVED" : "REJECTED";

  const req = await prisma.leaveRequest.update({
    where: { id },
    data: { status, reviewedById: session.id, reviewedAt: new Date() },
    include: { employee: { include: { user: { select: { id: true, name: true } } } } },
  });

  if (status === "APPROVED") {
    // Create attendance LEAVE rows for each day in range
    const start = new Date(req.startDate);
    const end = new Date(req.endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const date = new Date(d); date.setHours(0, 0, 0, 0);
      await prisma.attendance.upsert({
        where: { employeeId_date: { employeeId: req.employeeId, date } },
        update: { status: "LEAVE" },
        create: { employeeId: req.employeeId, date, status: "LEAVE", isApproved: true, approvedById: session.id },
      });
    }
    // Notify the employee
    await prisma.notification.create({
      data: {
        userId: req.employee.userId,
        type: "LEAVE_APPROVED",
        message: `Your leave request (${req.startDate.toLocaleDateString()} – ${req.endDate.toLocaleDateString()}) was approved`,
        relatedId: id,
      },
    });
  } else {
    await prisma.notification.create({
      data: {
        userId: req.employee.userId,
        type: "LEAVE_REJECTED",
        message: `Your leave request (${req.startDate.toLocaleDateString()} – ${req.endDate.toLocaleDateString()}) was rejected`,
        relatedId: id,
      },
    });
  }
  revalidatePath("/manager/leave");
}

export default async function ManagerLeavePage() {
  const pending = await prisma.leaveRequest.findMany({
    where: { status: "PENDING" },
    include: { employee: { include: { user: { select: { name: true } } } } },
    orderBy: { createdAt: "asc" },
  });

  const recent = await prisma.leaveRequest.findMany({
    where: { status: { not: "PENDING" } },
    include: {
      employee: { include: { user: { select: { name: true } } } },
      reviewedBy: { select: { name: true } },
    },
    orderBy: { reviewedAt: "desc" },
    take: 20,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Leave Requests</h1>

      {pending.length > 0 ? (
        <div className="space-y-2">
          <h2 className="font-semibold text-sm">Pending ({pending.length})</h2>
          {pending.map((r) => (
            <div key={r.id} className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <span className="font-medium">{r.employee.user.name}</span>
                  <span className="ml-2 text-sm text-gray-500">
                    {r.startDate.toLocaleDateString()} – {r.endDate.toLocaleDateString()}
                  </span>
                  {r.reason && <p className="mt-1 text-sm text-gray-600">"{r.reason}"</p>}
                </div>
                <div className="flex gap-2">
                  <form action={reviewLeave}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="action" value="approve" />
                    <button type="submit" className="rounded-lg bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700">
                      Approve
                    </button>
                  </form>
                  <form action={reviewLeave}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="action" value="reject" />
                    <button type="submit" className="rounded-lg bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700">
                      Reject
                    </button>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border bg-white p-6 text-center text-sm text-gray-400">No pending leave requests</p>
      )}

      {recent.length > 0 && (
        <div>
          <h2 className="mb-2 font-semibold text-sm">Recent Decisions</h2>
          <div className="rounded-xl border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left">Employee</th>
                  <th className="px-4 py-2 text-left">Dates</th>
                  <th className="px-4 py-2 text-left">Decision</th>
                  <th className="px-4 py-2 text-left">By</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2">{r.employee.user.name}</td>
                    <td className="px-4 py-2 text-gray-500">{r.startDate.toLocaleDateString()} – {r.endDate.toLocaleDateString()}</td>
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
