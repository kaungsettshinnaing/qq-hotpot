import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { formatDate } from "@/lib/format";
import { getT } from "@/lib/lang";

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
    await prisma.notification.create({
      data: {
        userId: req.employee.userId,
        type: "LEAVE_APPROVED",
        message: `Your leave request (${formatDate(req.startDate)} – ${formatDate(req.endDate)}) was approved`,
        relatedId: id,
      },
    });
  } else {
    await prisma.notification.create({
      data: {
        userId: req.employee.userId,
        type: "LEAVE_REJECTED",
        message: `Your leave request (${formatDate(req.startDate)} – ${formatDate(req.endDate)}) was rejected`,
        relatedId: id,
      },
    });
  }
  revalidatePath("/manager/leave");
}

export default async function ManagerLeavePage() {
  const t = await getT();

  const [pending, recent] = await Promise.all([
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
      take: 20,
    }),
  ]);

  const decisionLabel = (status: string) =>
    status === "APPROVED" ? t("status_leave_approved") : t("status_leave_rejected");

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">{t("heading_leave_requests")}</h1>

      {pending.length > 0 ? (
        <div className="space-y-2">
          <h2 className="font-semibold text-sm">{t("section_pending")} ({pending.length})</h2>
          {pending.map((r) => (
            <div key={r.id} className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <span className="font-medium">{r.employee.user.name}</span>
                  <span className="ml-2 text-sm text-gray-500">
                    {formatDate(r.startDate)} – {formatDate(r.endDate)}
                  </span>
                  {r.reason && <p className="mt-1 text-sm text-gray-600">&ldquo;{r.reason}&rdquo;</p>}
                </div>
                <div className="flex gap-2">
                  <form action={reviewLeave}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="action" value="approve" />
                    <button type="submit" className="rounded-lg bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700">
                      {t("btn_approve")}
                    </button>
                  </form>
                  <form action={reviewLeave}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="action" value="reject" />
                    <button type="submit" className="rounded-lg bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700">
                      {t("btn_reject")}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border bg-white p-6 text-center text-sm text-gray-400">
          {t("empty_no_pending_leave")}
        </p>
      )}

      {recent.length > 0 && (
        <div>
          <h2 className="mb-2 font-semibold text-sm">{t("section_recent_decisions")}</h2>
          <div className="rounded-xl border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left">{t("col_employee")}</th>
                  <th className="px-4 py-2 text-left">{t("col_dates")}</th>
                  <th className="px-4 py-2 text-left">{t("col_decision")}</th>
                  <th className="px-4 py-2 text-left">{t("col_by")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2">{r.employee.user.name}</td>
                    <td className="px-4 py-2 text-gray-500">{formatDate(r.startDate)} – {formatDate(r.endDate)}</td>
                    <td className="px-4 py-2">
                      <span className={`badge ${r.status === "APPROVED" ? "badge-green" : "badge-red"}`}>
                        {decisionLabel(r.status)}
                      </span>
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
