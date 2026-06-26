import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notifyManagers } from "@/lib/notifications";
import { formatDate, parseInputDate } from "@/lib/format";
import SubmitButton from "@/components/SubmitButton";

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

async function submitLeave(fd: FormData) {
  "use server";
  const session = await requireSession();
  const date = parseInputDate(fd.get("date") as string);
  const reason = (fd.get("reason") as string).trim();

  if (!date) redirect("/my-account/leave/new?error=date");

  const employee = await prisma.employee.findUnique({ where: { userId: session.id } });
  if (!employee) throw new Error("No employee record.");

  const req = await prisma.leaveRequest.create({
    data: { employeeId: session.id, startDate: date!, endDate: date!, reason: reason || null },
  });

  await notifyManagers(
    "LEAVE_REQUEST",
    `${session.name ?? "An employee"} has requested leave on ${formatDate(date!)}`,
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

  const restDayNames = employee.restDays.map((d) => DAY[d]);

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-xl font-bold">Request Leave</h1>

      {restDayNames.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-600">
          Your rest days: <span className="font-medium">{restDayNames.join(", ")}</span>
          <span className="ml-1 text-xs text-gray-400">(no need to request leave for these)</span>
        </div>
      )}

      {error === "date" && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Please enter a valid date in DD-MMM-YYYY format.
        </p>
      )}

      <form action={submitLeave} className="rounded-xl border bg-white p-6 shadow-sm space-y-4">
        <div>
          <label className="label">Date</label>
          <input
            name="date"
            type="text"
            placeholder="DD-MMM-YYYY"
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

      <p className="text-xs text-gray-400 text-center">
        Submit one request per day. Your manager will be notified.
      </p>
    </div>
  );
}
