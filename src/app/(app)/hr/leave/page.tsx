import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { hrReviewLeave, hrMarkAbsence } from "./actions";
import { getT } from "@/lib/lang";

import { mmToday } from "@/lib/business-day";
import SubmitButton from "@/components/SubmitButton";
import ErrorBanner from "@/components/ErrorBanner";
export default async function HRLeavePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: errorCode } = await searchParams;
  await requireAnyRole(["HR", "ADMIN"]);
  const t = await getT();
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

  const decisionLabel = (status: string) =>
    status === "APPROVED" ? t("status_leave_approved") : t("status_leave_rejected");

  return (
    <div className="space-y-6">
      <ErrorBanner code={errorCode} />
      <h1 className="text-xl font-bold">{t("heading_leave_management")}</h1>

      {pending.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold text-sm">{t("section_pending_requests")} ({pending.length})</h2>
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
                  <form action={hrReviewLeave}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="action" value="approve" />
                    <SubmitButton className="rounded-lg bg-green-600 px-3 py-1 text-sm text-white">
                      {t("btn_approve")}
                    </SubmitButton>
                  </form>
                  <form action={hrReviewLeave}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="action" value="reject" />
                    <SubmitButton className="rounded-lg bg-red-600 px-3 py-1 text-sm text-white">
                      {t("btn_reject")}
                    </SubmitButton>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-semibold text-sm">{t("section_mark_absence")}</h2>
        <form action={hrMarkAbsence} className="grid gap-3 sm:grid-cols-4">
          <select name="employeeId" required className="input">
            <option value="">{t("label_employee")}…</option>
            {employees.map((e) => <option key={e.userId} value={e.userId}>{e.user.name}</option>)}
          </select>
          <input name="date" type="date" required className="input" defaultValue={mmToday()} />
          <select name="status" className="input">
            <option value="ABSENT">{t("option_absent_unauthorised")}</option>
            <option value="LEAVE">{t("option_leave_authorised")}</option>
          </select>
          <SubmitButton className="btn-brand">{t("btn_mark_attendance")}</SubmitButton>
        </form>
      </div>

      {recent.length > 0 && (
        <div>
          <h2 className="mb-2 font-semibold text-sm">{t("section_recent_decisions")}</h2>
          <div className="rounded-xl border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left">{t("col_employee")}</th>
                  <th className="px-4 py-2 text-left">{t("col_dates")}</th>
                  <th className="px-4 py-2 text-left">{t("col_status")}</th>
                  <th className="px-4 py-2 text-left">{t("col_reviewed_by")}</th>
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
