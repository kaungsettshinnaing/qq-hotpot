import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notifyManagers } from "@/lib/notifications";

async function submitLeave(fd: FormData) {
  "use server";
  const session = await requireSession();
  const startDate = new Date(fd.get("startDate") as string);
  const endDate = new Date(fd.get("endDate") as string);
  const reason = (fd.get("reason") as string).trim();

  const employee = await prisma.employee.findUnique({ where: { userId: session.id } });
  if (!employee) throw new Error("No employee record.");

  const req = await prisma.leaveRequest.create({
    data: { employeeId: session.id, startDate, endDate, reason: reason || null },
  });

  await notifyManagers("LEAVE_REQUEST",
    `${session.name ?? "An employee"} has requested leave: ${startDate.toLocaleDateString()} – ${endDate.toLocaleDateString()}`,
    req.id,
  );

  redirect("/my-account/leave");
}

export default async function NewLeavePage() {
  const session = await requireSession();
  const now = new Date().toISOString().slice(0, 10);

  const employee = await prisma.employee.findUnique({ where: { userId: session.id } });
  if (!employee) {
    return (
      <div className="rounded-xl border bg-white p-10 text-center text-gray-400">
        No employee record linked to your account. Contact HR.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-xl font-bold">Request Leave</h1>

      <form action={submitLeave} className="rounded-xl border bg-white p-6 shadow-sm space-y-4">
        <div>
          <label className="label">Start Date</label>
          <input name="startDate" type="date" required className="input" defaultValue={now} min={now} />
        </div>
        <div>
          <label className="label">End Date</label>
          <input name="endDate" type="date" required className="input" defaultValue={now} min={now} />
        </div>
        <div>
          <label className="label">Reason (optional)</label>
          <textarea name="reason" className="input min-h-20" placeholder="Briefly describe the reason…" />
        </div>
        <div className="flex gap-3 pt-2">
          <button type="submit" className="btn-brand">Submit Request</button>
          <a href="/my-account/leave" className="btn-outline">Cancel</a>
        </div>
      </form>

      <p className="text-xs text-gray-400 text-center">
        Your request will be reviewed by your manager. You will be notified of the decision.
      </p>
    </div>
  );
}
