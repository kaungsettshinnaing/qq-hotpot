import { getLiveAttendanceStatus } from "@/lib/hr-attendance";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requireAnyRole } from "@/lib/auth";
import LiveAttendance from "./LiveAttendance";

async function approveAttendance(fd: FormData) {
  "use server";
  const session = await requireAnyRole(["MANAGER", "ADMIN"]);
  const id = fd.get("id") as string;
  await prisma.attendance.update({
    where: { id },
    data: { isApproved: true, approvedById: session.id },
  });
  revalidatePath("/manager/attendance");
}

async function bulkApproveToday(fd: FormData) {
  "use server";
  const session = await requireAnyRole(["MANAGER", "ADMIN"]);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  await prisma.attendance.updateMany({
    where: { date: today, isApproved: false, status: { not: "REST_DAY" } },
    data: { isApproved: true, approvedById: session.id },
  });
  revalidatePath("/manager/attendance");
}

export default async function AttendancePage() {
  const live = await getLiveAttendanceStatus();

  const serialised = live.map((e) => ({
    employeeId: e.employeeId,
    name: e.name,
    status: e.status,
    clockInAt: e.attendance?.clockInAt?.toISOString() ?? null,
    breakOutAt: e.attendance?.breakOutAt?.toISOString() ?? null,
    breakInAt: e.attendance?.breakInAt?.toISOString() ?? null,
    clockOutAt: e.attendance?.clockOutAt?.toISOString() ?? null,
  }));

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const pending = await prisma.attendance.findMany({
    where: { isApproved: false, status: { not: "REST_DAY" }, date: today },
    include: { employee: { include: { user: { select: { name: true } } } } },
    orderBy: { date: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Live Attendance — Today</h1>
        {pending.length > 0 && (
          <form action={bulkApproveToday}>
            <button type="submit" className="btn-brand">Approve All Today</button>
          </form>
        )}
      </div>

      <LiveAttendance entries={serialised} />

      {pending.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold text-sm">Pending Approval</h2>
          {pending.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-lg border bg-white px-4 py-2 text-sm">
              <span>{a.employee.user.name} — <span className="text-gray-400">{a.status}</span></span>
              <form action={approveAttendance}>
                <input type="hidden" name="id" value={a.id} />
                <button type="submit" className="text-xs text-brand hover:underline">Approve</button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
