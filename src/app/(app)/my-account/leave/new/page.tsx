import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notifyManagers } from "@/lib/notifications";
import { formatDate, parseInputDate } from "@/lib/format";
import SubmitButton from "@/components/SubmitButton";

async function submitLeave(fd: FormData) {
  "use server";
  const session = await requireSession();
  const raw = (fd.get("date") as string | null)?.trim();
  if (!raw) redirect("/my-account/leave/new?error=date");

  // parseInputDate handles DD-MMM-YYYY (e.g. 02-Jul-2026)
  const date = parseInputDate(raw);
  if (!date) redirect("/my-account/leave/new?error=date");

  const reason = (fd.get("reason") as string).trim();

  const employee = await prisma.employee.findUnique({ where: { userId: session.id } });
  if (!employee) throw new Error("No employee record.");

  const req = await prisma.leaveRequest.create({
    data: { employeeId: session.id, startDate: date, endDate: date, reason: reason || null },
  });

  await notifyManagers(
    "LEAVE_REQUEST",
    `${session.name ?? "An employee"} has requested leave on ${formatDate(date)}`,
    req.id,
  );

  redirect("/my-account/leave");
}

export default async function NewLeavePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const session = await requireSession();

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

      <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <div className="font-semibold">Unpaid leave</div>
        <div className="mt-0.5 text-xs text-amber-700">
          Leave requests are unpaid and require manager approval. Rest days don&apos;t need a request.
        </div>
      </div>

      {error === "date" && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Please select a valid date.
        </p>
      )}

      <form action={submitLeave} className="rounded-xl border bg-white p-6 shadow-sm space-y-4">
        <div>
          <label className="label">Date</label>
          <input
            name="date"
            type="text"
            placeholder="DD-MMM-YYYY  e.g. 02-Jul-2026"
            required
            className="input"
          />
        </div>
        <div>
          <label className="label">Reason (optional)</label>
          <textarea name="reason" className="input min-h-20" placeholder="Briefly describe the reason…" />
        </div>
        <div className="flex gap-3 pt-2">
          <SubmitButton className="btn-brand disabled:opacity-60">Submit Request</SubmitButton>
          <a href="/my-account/leave" className="btn-outline">Cancel</a>
        </div>
      </form>
    </div>
  );
}
