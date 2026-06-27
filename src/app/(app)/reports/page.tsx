import Link from "next/link";
import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { revalidatePath } from "next/cache";
import { freePotsAllowed } from "@/lib/pricing";
import { formatMoney, formatDateTime } from "@/lib/format";
import type { AttendanceStatus, DayType } from "@prisma/client";

export const dynamic = "force-dynamic";

// ── Server actions for Attendance tab ────────────────────────────────────────

async function approveAttendance(fd: FormData) {
  "use server";
  const session = await requireAnyRole(["MANAGER", "ADMIN"]);
  const id = fd.get("id") as string;
  const status = fd.get("status") as AttendanceStatus;
  const dayType = ((fd.get("dayType") as string | null) ?? "FULL") as DayType;
  await prisma.attendance.update({
    where: { id },
    data: { status, dayType, isApproved: true, approvedById: session.id },
  });
  revalidatePath("/reports");
}

async function rejectAttendance(fd: FormData) {
  "use server";
  const session = await requireAnyRole(["MANAGER", "ADMIN"]);
  const id = fd.get("id") as string;
  await prisma.attendance.update({
    where: { id },
    data: { status: "ABSENT", isApproved: true, approvedById: session.id },
  });
  revalidatePath("/reports");
}

async function markAbsent(fd: FormData) {
  "use server";
  const session = await requireAnyRole(["MANAGER", "ADMIN"]);
  const employeeId = fd.get("employeeId") as string;
  const dateStr = fd.get("date") as string;
  const date = new Date(`${dateStr}T00:00:00`);
  await prisma.attendance.upsert({
    where: { employeeId_date: { employeeId, date } },
    update: { status: "ABSENT", isApproved: true, approvedById: session.id },
    create: { employeeId, date, status: "ABSENT", isApproved: true, approvedById: session.id },
  });
  revalidatePath("/reports");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, "0"); }
function dayString(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fmt(d: Date | null) {
  if (!d) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const STATUS_OPTS: AttendanceStatus[] = ["PRESENT", "OT", "ABSENT", "LEAVE", "REST_DAY"];
const STATUS_BG: Record<AttendanceStatus, string> = {
  PRESENT: "bg-green-100 text-green-800",
  OT: "bg-purple-100 text-purple-800",
  ABSENT: "bg-red-100 text-red-700",
  LEAVE: "bg-blue-100 text-blue-700",
  REST_DAY: "bg-gray-100 text-gray-500",
};

const UNIT_LABEL: Record<string, string> = {
  UNIT: "Unit", GRAM: "g", KG: "kg", LITRE: "L", BOX: "Box", BOTTLE: "Btl", PACK: "Pack",
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; date?: string }>;
}) {
  await requireAnyRole(["MANAGER", "ADMIN"]);
  const settings = await getSettings();
  const c = settings.currency;

  const { tab = "cash", date } = await searchParams;
  const today = dayString(new Date());
  const dayStr = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;
  const start = new Date(`${dayStr}T00:00:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  // ── Tab navigation ────────────────────────────────────────────────────────

  const tabs = [
    { key: "cash",       label: "Cash Review" },
    { key: "attendance", label: "Attendance" },
    { key: "inventory",  label: "Inventory Review" },
  ];

  return (
    <div className="space-y-4">
      {/* Header + date picker */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Reports</h1>
        <form method="get" className="flex items-center gap-2 text-sm">
          <input type="hidden" name="tab" value={tab} />
          <input
            type="date"
            name="date"
            defaultValue={dayStr}
            className="rounded-lg border border-gray-300 px-3 py-1.5"
          />
          <button className="rounded-lg bg-gray-800 px-3 py-1.5 font-medium text-white hover:bg-gray-900">
            View
          </button>
        </form>
      </div>

      {/* Tab bar */}
      <div className="flex overflow-x-auto border-b border-gray-200">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/reports?tab=${t.key}&date=${dayStr}`}
            className={
              "whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition -mb-px " +
              (tab === t.key
                ? "border-brand text-brand"
                : "border-transparent text-gray-500 hover:text-gray-700")
            }
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* ── Cash Review ──────────────────────────────────────────────────── */}
      {tab === "cash" && <CashTab dayStr={dayStr} start={start} end={end} c={c} settings={settings} />}

      {/* ── Attendance ───────────────────────────────────────────────────── */}
      {tab === "attendance" && (
        <AttendanceTab
          dayStr={dayStr}
          start={start}
          end={end}
          approveAttendance={approveAttendance}
          rejectAttendance={rejectAttendance}
          markAbsent={markAbsent}
        />
      )}

      {/* ── Inventory Review ─────────────────────────────────────────────── */}
      {tab === "inventory" && <InventoryTab start={start} end={end} />}
    </div>
  );
}

// ── Cash Review tab ───────────────────────────────────────────────────────────

async function CashTab({ dayStr, start, end, c, settings }: {
  dayStr: string;
  start: Date;
  end: Date;
  c: string;
  settings: Awaited<ReturnType<typeof getSettings>>;
}) {
  const [payments, closedSessions, expenses, shifts] = await Promise.all([
    prisma.payment.findMany({ where: { receivedAt: { gte: start, lt: end } } }),
    prisma.tableSession.findMany({
      where: { status: "CLOSED", closedAt: { gte: start, lt: end } },
      select: {
        adults: true,
        children: true,
        potOrders: { where: { voidedAt: null }, select: { id: true } },
      },
    }),
    prisma.expense.findMany({
      where: { businessDate: { gte: start, lt: end } },
      include: { category: true },
    }),
    prisma.cashierShift.findMany({
      where: { status: "CLOSED", closedAt: { gte: start, lt: end } },
      include: { cashier: { select: { name: true } } },
      orderBy: { closedAt: "asc" },
    }),
  ]);

  const sum = (arr: { amount: number }[]) => arr.reduce((s, x) => s + x.amount, 0);
  const cash = sum(payments.filter((p) => p.method === "CASH"));
  const kbz = sum(payments.filter((p) => p.method === "KBZPAY"));
  const other = sum(payments.filter((p) => p.method === "OTHER"));
  const totalSales = cash + kbz + other;

  const adults = closedSessions.reduce((s, x) => s + x.adults, 0);
  const children = closedSessions.reduce((s, x) => s + x.children, 0);
  let totalPots = 0, paidPots = 0;
  for (const s of closedSessions) {
    const t = s.potOrders.length;
    totalPots += t;
    paidPots += Math.max(0, t - freePotsAllowed(s.adults + s.children, settings.freePotRatio, settings.freePotRounding));
  }

  const cashExpenses = sum(expenses.filter((e) => e.paymentSource === "CASH_DRAWER"));
  const bankExpenses = sum(expenses.filter((e) => e.paymentSource === "BANK_TRANSFER"));
  const netCash = cash - cashExpenses;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total sales" value={formatMoney(totalSales, c)} accent />
        <Stat label="Bills settled" value={String(closedSessions.length)} />
        <Stat label="Covers (A/C)" value={`${adults} / ${children}`} />
        <Stat label="Pots (paid/total)" value={`${paidPots} / ${totalPots}`} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">Sales by method</h3>
          <dl className="space-y-1 text-sm">
            <Row label="Cash" value={formatMoney(cash, c)} />
            <Row label="KBZPay" value={formatMoney(kbz, c)} />
            <Row label="Other" value={formatMoney(other, c)} />
            <div className="flex justify-between border-t border-gray-200 pt-1 font-bold">
              <span>Total</span>
              <span className="tabular-nums">{formatMoney(totalSales, c)}</span>
            </div>
          </dl>
        </section>

        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">Cash position</h3>
          <dl className="space-y-1 text-sm">
            <Row label="Cash sales" value={formatMoney(cash, c)} />
            <Row label="− Cash-drawer expenses" value={formatMoney(cashExpenses, c)} />
            <div className="flex justify-between border-t border-gray-200 pt-1 font-bold">
              <span>Net cash movement</span>
              <span className="tabular-nums">{formatMoney(netCash, c)}</span>
            </div>
            <Row label="Bank-transfer expenses" value={formatMoney(bankExpenses, c)} muted />
          </dl>
        </section>
      </div>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">Expenses ({expenses.length})</h3>
        {expenses.length === 0 ? (
          <p className="text-sm text-gray-400">No expenses.</p>
        ) : (
          <ul className="divide-y divide-gray-100 text-sm">
            {expenses.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-1.5">
                <span>
                  {e.description}
                  <span className="ml-2 text-xs text-gray-400">
                    {e.category.name} · {e.paymentSource === "CASH_DRAWER" ? "Cash" : "Bank"}
                  </span>
                </span>
                <span className="tabular-nums">{formatMoney(e.amount, c)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">Shifts closed ({shifts.length})</h3>
        {shifts.length === 0 ? (
          <p className="text-sm text-gray-400">No shifts closed on this day.</p>
        ) : (
          <ul className="divide-y divide-gray-100 text-sm">
            {shifts.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-1.5">
                <span>
                  {s.cashier.name}
                  <span className="ml-2 text-xs text-gray-400">
                    {formatDateTime(s.openedAt)} → {s.closedAt ? formatDateTime(s.closedAt) : "—"}
                  </span>
                </span>
                <span className={
                  "font-semibold tabular-nums " +
                  ((s.variance ?? 0) < 0 ? "text-red-600" : (s.variance ?? 0) > 0 ? "text-amber-600" : "text-emerald-600")
                }>
                  {formatMoney(s.variance ?? 0, c)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ── Attendance tab ────────────────────────────────────────────────────────────

async function AttendanceTab({ dayStr, start, end, approveAttendance, rejectAttendance, markAbsent }: {
  dayStr: string;
  start: Date;
  end: Date;
  approveAttendance: (fd: FormData) => Promise<void>;
  rejectAttendance: (fd: FormData) => Promise<void>;
  markAbsent: (fd: FormData) => Promise<void>;
}) {
  const [allUnapproved, todayAttendances, allEmployees] = await Promise.all([
    // All pending across ALL dates — matches the dashboard count
    prisma.attendance.findMany({
      where: { isApproved: false, status: { not: "REST_DAY" } },
      include: { employee: { include: { user: { select: { name: true } } } } },
      orderBy: [{ date: "asc" }, { employee: { user: { name: "asc" } } }],
    }),
    prisma.attendance.findMany({
      where: { date: start, status: { not: "REST_DAY" } },
      include: { employee: { include: { user: { select: { name: true } } } } },
      orderBy: { employee: { user: { name: "asc" } } },
    }),
    prisma.employee.findMany({
      where: { isActive: true, isSystem: false },
      include: { user: { select: { name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
  ]);

  const dayOfWeek = start.getDay();
  const attendedIds = new Set(todayAttendances.map((a) => a.employeeId));
  const unapproved = allUnapproved; // all dates, not just today
  const approved = todayAttendances.filter((a) => a.isApproved);

  // Employees with no attendance record today (and not a rest day)
  const unrecorded = allEmployees.filter(
    (e) => !attendedIds.has(e.userId) && !e.restDays.includes(dayOfWeek),
  );
  const onRestToday = allEmployees.filter(
    (e) => !attendedIds.has(e.userId) && e.restDays.includes(dayOfWeek),
  );

  const isToday = dayStr === (() => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; })();

  return (
    <div className="space-y-5">

      {/* Pending review */}
      {unapproved.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-orange-600">
            Pending review — all dates ({unapproved.length})
          </h3>
          {unapproved.map((a) => (
            <div key={a.id} className="rounded-xl border border-orange-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-1 mb-3">
                <div>
                  <div className="font-semibold text-gray-800">{a.employee.user.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    <span className="font-medium text-gray-700">{a.date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric", weekday: "short" })}</span>
                    &nbsp;·&nbsp; In: {fmt(a.clockInAt)} &nbsp;·&nbsp; Out: {fmt(a.clockOutAt)}
                  </div>
                </div>
                <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-600">
                  Pending
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* Approve form */}
                <form action={approveAttendance} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={a.id} />
                  <select name="status" defaultValue={a.status}
                    className="rounded-lg border border-gray-300 px-2 py-2 text-sm flex-1 min-w-[110px]">
                    {STATUS_OPTS.map((s) => (
                      <option key={s} value={s}>{s.replace("_", " ")}</option>
                    ))}
                  </select>
                  <select name="dayType" defaultValue={a.dayType}
                    className="rounded-lg border border-gray-300 px-2 py-2 text-sm">
                    <option value="FULL">Full day</option>
                    <option value="HALF">Half day</option>
                  </select>
                  <button type="submit"
                    className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 active:scale-95 transition">
                    Approve
                  </button>
                </form>
                {/* Reject button */}
                <form action={rejectAttendance}>
                  <input type="hidden" name="id" value={a.id} />
                  <button type="submit"
                    className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 active:scale-95 transition">
                    Reject
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Approved */}
      {approved.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-green-700">Approved ({approved.length})</h3>
          {approved.map((a) => (
            <div key={a.id} className="rounded-xl border border-green-100 bg-green-50/30 p-3.5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-800">{a.employee.user.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_BG[a.status]}`}>
                      {a.status.replace("_", " ")}
                    </span>
                    <span className="text-[11px] text-gray-400">
                      {a.dayType === "HALF" ? "½ day" : "Full"}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-gray-400">
                    {a.date.toLocaleDateString(undefined, { day: "2-digit", month: "short", weekday: "short" })}
                    &nbsp;·&nbsp; In: {fmt(a.clockInAt)} &nbsp;·&nbsp; Out: {fmt(a.clockOutAt)}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <form action={approveAttendance} className="flex items-center gap-1.5">
                    <input type="hidden" name="id" value={a.id} />
                    <select name="status" defaultValue={a.status}
                      className="rounded-lg border border-gray-200 px-1.5 py-1.5 text-xs">
                      {STATUS_OPTS.map((s) => (
                        <option key={s} value={s}>{s.replace("_", " ")}</option>
                      ))}
                    </select>
                    <select name="dayType" defaultValue={a.dayType}
                      className="rounded-lg border border-gray-200 px-1.5 py-1.5 text-xs">
                      <option value="FULL">Full</option>
                      <option value="HALF">Half</option>
                    </select>
                    <button type="submit"
                      className="rounded-lg bg-gray-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 active:scale-95 transition">
                      Update
                    </button>
                  </form>
                  <form action={rejectAttendance}>
                    <input type="hidden" name="id" value={a.id} />
                    <button type="submit"
                      className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 active:scale-95 transition">
                      Reject
                    </button>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Unrecorded (no clock-in, not a rest day) */}
      {unrecorded.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-red-600">
            Not recorded — {isToday ? "possibly absent" : "absent"} ({unrecorded.length})
          </h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {unrecorded.map((e) => (
              <div key={e.userId} className="flex items-center justify-between rounded-xl border bg-white px-4 py-3 shadow-sm">
                <span className="font-medium text-gray-800">{e.user.name}</span>
                <form action={markAbsent}>
                  <input type="hidden" name="employeeId" value={e.userId} />
                  <input type="hidden" name="date" value={dayStr} />
                  <button type="submit"
                    className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 active:scale-95 transition">
                    Mark ABSENT
                  </button>
                </form>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rest day employees */}
      {onRestToday.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-violet-600">Rest day ({onRestToday.length})</h3>
          <div className="flex flex-wrap gap-2">
            {onRestToday.map((e) => (
              <span key={e.userId}
                className="rounded-full bg-violet-100 px-3 py-1 text-sm font-medium text-violet-700">
                {e.user.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {todayAttendances.length === 0 && unrecorded.length === 0 && onRestToday.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-400">No employee data for this date.</p>
      )}
    </div>
  );
}

// ── Inventory Review tab ──────────────────────────────────────────────────────

async function InventoryTab({ start, end }: { start: Date; end: Date }) {
  const movements = await prisma.stockMovement.findMany({
    where: { type: "USAGE_OUT", createdAt: { gte: start, lt: end } },
    include: { stockItem: { select: { name: true, unit: true } } },
    orderBy: { createdAt: "asc" },
  });

  // Group by item
  const byItem = new Map<string, { name: string; unit: string; totalQty: number; count: number }>();
  for (const m of movements) {
    const key = m.stockItemId;
    if (!byItem.has(key)) {
      byItem.set(key, { name: m.stockItem.name, unit: m.stockItem.unit, totalQty: 0, count: 0 });
    }
    const entry = byItem.get(key)!;
    entry.totalQty += m.qty;
    entry.count += 1;
  }
  const summary = [...byItem.values()].sort((a, b) => a.name.localeCompare(b.name));

  if (summary.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-400">No usage recorded on this date.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        {movements.length} usage record{movements.length !== 1 ? "s" : ""} across {summary.length} item{summary.length !== 1 ? "s" : ""}.
      </p>

      {/* Mobile cards */}
      <div className="grid grid-cols-1 gap-2 sm:hidden">
        {summary.map((item) => (
          <div key={item.name} className="flex items-center justify-between rounded-xl border bg-white px-4 py-3 shadow-sm">
            <span className="font-medium text-gray-800">{item.name}</span>
            <span className="font-bold text-red-600 tabular-nums">
              {item.totalQty} {UNIT_LABEL[item.unit] ?? item.unit}
            </span>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block rounded-xl border bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left">Item</th>
              <th className="px-4 py-2 text-right">Total used</th>
              <th className="px-4 py-2 text-right">Unit</th>
              <th className="px-4 py-2 text-right">Records</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {summary.map((item) => (
              <tr key={item.name}>
                <td className="px-4 py-2.5 font-medium text-gray-800">{item.name}</td>
                <td className="px-4 py-2.5 text-right font-bold text-red-600 tabular-nums">{item.totalQty}</td>
                <td className="px-4 py-2.5 text-right text-gray-500">{UNIT_LABEL[item.unit] ?? item.unit}</td>
                <td className="px-4 py-2.5 text-right text-gray-400">{item.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Shared UI components ──────────────────────────────────────────────────────

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={"rounded-xl p-4 shadow-sm " + (accent ? "bg-brand text-white" : "bg-white")}>
      <div className={"text-xs uppercase " + (accent ? "opacity-80" : "text-gray-400")}>{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={"flex justify-between " + (muted ? "text-gray-400" : "")}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
