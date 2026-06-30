import Link from "next/link";
import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { revalidatePath } from "next/cache";
import { freePotsAllowed } from "@/lib/pricing";
import { formatMoney, formatDateTime } from "@/lib/format";
import { getT } from "@/lib/lang";
import type { AttendanceStatus, DayType } from "@prisma/client";

async function submitDailyReport(fd: FormData) {
  "use server";
  const session = await requireAnyRole(["MANAGER", "ADMIN"]);
  const content = (fd.get("content") as string ?? "").trim();
  if (!content) return;
  const dayStr = fd.get("date") as string;
  const date = new Date(`${dayStr}T00:00:00`);
  await prisma.dailyReport.create({
    data: { date, content, createdById: session.id },
  });
  revalidatePath("/reports");
}

async function confirmExpense(fd: FormData) {
  "use server";
  const session = await requireAnyRole(["MANAGER", "ADMIN"]);
  const id = fd.get("id") as string;
  await prisma.expense.update({
    where: { id },
    data: { confirmedAt: new Date(), confirmedById: session.id },
  });
  revalidatePath("/reports");
  revalidatePath("/accounting");
}

export const dynamic = "force-dynamic";

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
  await prisma.attendance.update({ where: { id }, data: { status: "ABSENT", isApproved: true, approvedById: session.id } });
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

async function deleteClockOut(fd: FormData) {
  "use server";
  await requireAnyRole(["MANAGER", "ADMIN"]);
  const id = fd.get("id") as string;
  await prisma.attendance.update({ where: { id }, data: { clockOutAt: null } });
  revalidatePath("/reports");
}

function pad(n: number) { return String(n).padStart(2, "0"); }
function dayString(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
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

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; date?: string }>;
}) {
  await requireAnyRole(["MANAGER", "ADMIN"]);
  const settings = await getSettings();
  const c = settings.currency;
  const t = await getT();

  const { tab = "cash", date } = await searchParams;
  const today = dayString(new Date());
  const dayStr = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;
  const start = new Date(`${dayStr}T00:00:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  const tabs = [
    { key: "cash",          label: t("tab_cash_review") },
    { key: "attendance",    label: t("tab_attendance") },
    { key: "inventory",     label: t("tab_inventory_review") },
    { key: "expenses",      label: t("tab_expenses") },
    { key: "daily-report",  label: t("tab_daily_report") },
    { key: "daily-summary", label: t("tab_daily_summary") },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{t("heading_reports")}</h1>
        <form method="get" className="flex items-center gap-2 text-sm">
          <input type="hidden" name="tab" value={tab} />
          <input type="date" name="date" defaultValue={dayStr}
            className="rounded-lg border border-gray-300 px-3 py-1.5" />
          <button className="rounded-lg bg-gray-800 px-3 py-1.5 font-medium text-white hover:bg-gray-900">
            {t("btn_view_report")}
          </button>
        </form>
      </div>

      <div className="flex overflow-x-auto border-b border-gray-200">
        {tabs.map((tab_) => (
          <Link key={tab_.key} href={`/reports?tab=${tab_.key}&date=${dayStr}`}
            className={"whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition -mb-px " +
              (tab === tab_.key ? "border-brand text-brand" : "border-transparent text-gray-500 hover:text-gray-700")}>
            {tab_.label}
          </Link>
        ))}
      </div>

      {tab === "cash" && <CashTab dayStr={dayStr} start={start} end={end} c={c} settings={settings} />}
      {tab === "attendance" && (
        <AttendanceTab
          deleteClockOut={deleteClockOut}
          dayStr={dayStr}
          start={start}
          approveAttendance={approveAttendance}
          rejectAttendance={rejectAttendance}
          markAbsent={markAbsent}
        />
      )}
      {tab === "inventory"    && <InventoryTab start={start} end={end} />}
      {tab === "expenses"       && <ExpensesTab confirmExpense={confirmExpense} />}
      {tab === "daily-report"  && <DailyReportTab dayStr={dayStr} submitDailyReport={submitDailyReport} />}
      {tab === "daily-summary" && <DailySummaryTab dayStr={dayStr} start={start} end={end} c={c} settings={settings} />}
    </div>
  );
}

async function CashTab({ dayStr, start, end, c, settings }: {
  dayStr: string; start: Date; end: Date; c: string;
  settings: Awaited<ReturnType<typeof getSettings>>;
}) {
  const t = await getT();
  const [payments, closedSessions, expenses, shifts] = await Promise.all([
    prisma.payment.findMany({ where: { receivedAt: { gte: start, lt: end } } }),
    prisma.tableSession.findMany({
      where: { status: "CLOSED", closedAt: { gte: start, lt: end } },
      select: {
        adults: true,
        children: true,
        billTotal: true,
        payments: { select: { method: true, amount: true } },
        potOrders: { where: { voidedAt: null }, select: { id: true } },
      },
    }),
    prisma.expense.findMany({ where: { businessDate: { gte: start, lt: end } }, include: { category: true } }),
    prisma.cashierShift.findMany({
      where: { status: "CLOSED", closedAt: { gte: start, lt: end } },
      include: { cashier: { select: { name: true } } },
      orderBy: { closedAt: "asc" },
    }),
  ]);

  const sum = (arr: { amount: number }[]) => arr.reduce((s, x) => s + x.amount, 0);
  const grossCash = sum(payments.filter((p) => p.method === "CASH"));
  const kbz  = sum(payments.filter((p) => p.method === "KBZPAY"));
  const other = sum(payments.filter((p) => p.method === "OTHER"));

  // Deduct change (cash overpayment) so cash shows net revenue, not tendered amount
  let cashChange = 0;
  for (const s of closedSessions) {
    if (s.payments.some((p) => p.method === "CASH")) {
      const totalPaid = s.payments.reduce((acc, p) => acc + p.amount, 0);
      cashChange += Math.max(0, totalPaid - (s.billTotal ?? totalPaid));
    }
  }
  const cash = grossCash - cashChange;
  const totalSales = cash + kbz + other;

  const adults = closedSessions.reduce((s, x) => s + x.adults, 0);
  const children = closedSessions.reduce((s, x) => s + x.children, 0);
  let totalPots = 0, paidPots = 0;
  for (const s of closedSessions) {
    const total = s.potOrders.length;
    totalPots += total;
    paidPots += Math.max(0, total - freePotsAllowed(s.adults + s.children, settings.freePotRatio, settings.freePotRounding));
  }

  const cashExpenses = sum(expenses.filter((e) => e.paymentSource === "CASH_DRAWER"));
  const bankExpenses = sum(expenses.filter((e) => e.paymentSource === "BANK_TRANSFER"));
  const netCash = cash - cashExpenses;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t("stat_total_sales")} value={formatMoney(totalSales, c)} accent />
        <Stat label={t("stat_bills_settled")} value={String(closedSessions.length)} />
        <Stat label={t("stat_covers")} value={`${adults} / ${children}`} />
        <Stat label={t("stat_pots")} value={`${paidPots} / ${totalPots}`} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">{t("section_sales_by_method")}</h3>
          <dl className="space-y-1 text-sm">
            <Row label={t("row_cash")} value={formatMoney(cash, c)} />
            <Row label={t("row_kbzpay")} value={formatMoney(kbz, c)} />
            <Row label={t("row_other")} value={formatMoney(other, c)} />
            <div className="flex justify-between border-t border-gray-200 pt-1 font-bold">
              <span>{t("row_total")}</span>
              <span className="tabular-nums">{formatMoney(totalSales, c)}</span>
            </div>
          </dl>
        </section>

        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">{t("section_cash_position")}</h3>
          <dl className="space-y-1 text-sm">
            <Row label={t("row_cash_sales_pos")} value={formatMoney(cash, c)} />
            <Row label={t("row_minus_cash_expenses")} value={formatMoney(cashExpenses, c)} />
            <div className="flex justify-between border-t border-gray-200 pt-1 font-bold">
              <span>{t("row_net_cash_movement")}</span>
              <span className="tabular-nums">{formatMoney(netCash, c)}</span>
            </div>
            <Row label={t("row_bank_expenses")} value={formatMoney(bankExpenses, c)} muted />
          </dl>
        </section>
      </div>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">{t("section_expenses")} ({expenses.length})</h3>
        {expenses.length === 0 ? (
          <p className="text-sm text-gray-400">{t("empty_no_expenses")}</p>
        ) : (
          <ul className="divide-y divide-gray-100 text-sm">
            {expenses.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-1.5">
                <span>
                  {e.description}
                  <span className="ml-2 text-xs text-gray-400">
                    {e.category.name} · {e.paymentSource === "CASH_DRAWER" ? t("source_cash_drawer") : t("source_bank_transfer")}
                  </span>
                </span>
                <span className="tabular-nums">{formatMoney(e.amount, c)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">{t("section_shifts_closed")} ({shifts.length})</h3>
        {shifts.length === 0 ? (
          <p className="text-sm text-gray-400">{t("empty_no_shifts_today")}</p>
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
                <span className={"font-semibold tabular-nums " +
                  ((s.variance ?? 0) < 0 ? "text-red-600" : (s.variance ?? 0) > 0 ? "text-amber-600" : "text-emerald-600")}>
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

async function AttendanceTab({ dayStr, start, approveAttendance, rejectAttendance, markAbsent, deleteClockOut }: {
  dayStr: string; start: Date;
  approveAttendance: (fd: FormData) => Promise<void>;
  rejectAttendance: (fd: FormData) => Promise<void>;
  markAbsent: (fd: FormData) => Promise<void>;
  deleteClockOut: (fd: FormData) => Promise<void>;
}) {
  const t = await getT();
  // Filter by clockInAt within the Myanmar calendar day (UTC+6:30).
  // Falls back to the stored date field for records without a clock-in (ABSENT, LEAVE).
  const startMM = new Date(`${dayStr}T00:00:00+06:30`);
  const endMM = new Date(startMM.getTime() + 24 * 60 * 60 * 1000);
  const attWhere = {
    OR: [
      { clockInAt: { gte: startMM, lt: endMM } },
      { clockInAt: null as null, date: start },
    ],
    status: { not: "REST_DAY" as const },
  };

  const [allUnapproved, todayAttendances, allEmployees] = await Promise.all([
    prisma.attendance.findMany({
      where: { isApproved: false, ...attWhere },
      include: { employee: { include: { user: { select: { name: true } } } } },
      orderBy: [{ date: "asc" }, { employee: { user: { name: "asc" } } }],
    }),
    prisma.attendance.findMany({
      where: attWhere,
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
  const unapproved = allUnapproved;
  const approved = todayAttendances.filter((a) => a.isApproved);
  const unrecorded = allEmployees.filter((e) => !attendedIds.has(e.userId) && !e.restDays.includes(dayOfWeek));
  const onRestToday = allEmployees.filter((e) => !attendedIds.has(e.userId) && e.restDays.includes(dayOfWeek));
  const isToday = dayStr === (() => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; })();

  return (
    <div className="space-y-5">
      {unapproved.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-orange-600">
            {t("attendance_pending_review")} — {unapproved.length}
          </h3>
          {unapproved.map((a) => (
            <div key={a.id} className="rounded-xl border border-orange-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-1 mb-3">
                <div>
                  <div className="font-semibold text-gray-800">{a.employee.user.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    <span className="font-medium text-gray-700">
                      {a.date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric", weekday: "short" })}
                    </span>
                    &nbsp;·&nbsp; {t("attendance_clock_in")} {fmt(a.clockInAt)} &nbsp;·&nbsp; {t("attendance_clock_out")} {fmt(a.clockOutAt)}
                  </div>
                </div>
                <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-600">
                  {t("attendance_pending_review")}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <form action={approveAttendance} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={a.id} />
                  <select name="status" defaultValue={a.status}
                    className="rounded-lg border border-gray-300 px-2 py-2 text-sm flex-1 min-w-[110px]">
                    {STATUS_OPTS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                  </select>
                  <select name="dayType" defaultValue={a.dayType}
                    className="rounded-lg border border-gray-300 px-2 py-2 text-sm">
                    <option value="FULL">{t("option_full_day")}</option>
                    <option value="HALF">{t("option_half_day")}</option>
                  </select>
                  <button type="submit"
                    className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 active:scale-95 transition">
                    {t("btn_approve")}
                  </button>
                </form>
                <form action={rejectAttendance}>
                  <input type="hidden" name="id" value={a.id} />
                  <button type="submit"
                    className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 active:scale-95 transition">
                    {t("btn_reject")}
                  </button>
                </form>
                {a.clockOutAt && (
                  <form action={deleteClockOut}>
                    <input type="hidden" name="id" value={a.id} />
                    <button type="submit"
                      className="rounded-xl border border-amber-400 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50 active:scale-95 transition">
                      {t("btn_remove_clock_out")}
                    </button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {approved.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-green-700">{t("attendance_approved")} ({approved.length})</h3>
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
                      {a.dayType === "HALF" ? t("option_half_day") : t("option_full_day")}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-gray-400">
                    {a.date.toLocaleDateString(undefined, { day: "2-digit", month: "short", weekday: "short" })}
                    &nbsp;·&nbsp; {t("attendance_clock_in")} {fmt(a.clockInAt)} &nbsp;·&nbsp; {t("attendance_clock_out")} {fmt(a.clockOutAt)}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <form action={approveAttendance} className="flex items-center gap-1.5">
                    <input type="hidden" name="id" value={a.id} />
                    <select name="status" defaultValue={a.status}
                      className="rounded-lg border border-gray-200 px-1.5 py-1.5 text-xs">
                      {STATUS_OPTS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                    </select>
                    <select name="dayType" defaultValue={a.dayType}
                      className="rounded-lg border border-gray-200 px-1.5 py-1.5 text-xs">
                      <option value="FULL">{t("option_full_day")}</option>
                      <option value="HALF">{t("option_half_day")}</option>
                    </select>
                    <button type="submit"
                      className="rounded-lg bg-gray-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 active:scale-95 transition">
                      {t("btn_update")}
                    </button>
                  </form>
                  <form action={rejectAttendance}>
                    <input type="hidden" name="id" value={a.id} />
                    <button type="submit"
                      className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 active:scale-95 transition">
                      {t("btn_reject")}
                    </button>
                  </form>
                  {a.clockOutAt && (
                    <form action={deleteClockOut}>
                      <input type="hidden" name="id" value={a.id} />
                      <button type="submit"
                        className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50 active:scale-95 transition">
                        {t("btn_remove_clock_out")}
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {unrecorded.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-red-600">
            {isToday ? t("attendance_not_recorded") : t("attendance_absent")} ({unrecorded.length})
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
                    {t("btn_mark_absent")}
                  </button>
                </form>
              </div>
            ))}
          </div>
        </div>
      )}

      {onRestToday.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-violet-600">{t("attendance_rest_day")} ({onRestToday.length})</h3>
          <div className="flex flex-wrap gap-2">
            {onRestToday.map((e) => (
              <span key={e.userId} className="rounded-full bg-violet-100 px-3 py-1 text-sm font-medium text-violet-700">
                {e.user.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {todayAttendances.length === 0 && unrecorded.length === 0 && onRestToday.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-400">{t("empty_no_employee_data")}</p>
      )}
    </div>
  );
}

async function InventoryTab({ start, end }: { start: Date; end: Date }) {
  const t = await getT();
  const movements = await prisma.stockMovement.findMany({
    where: { type: "USAGE_OUT", createdAt: { gte: start, lt: end } },
    include: { stockItem: { select: { name: true, unit: true } } },
    orderBy: { createdAt: "asc" },
  });

  const byItem = new Map<string, { name: string; unit: string; totalQty: number; count: number }>();
  for (const m of movements) {
    const key = m.stockItemId;
    if (!byItem.has(key)) byItem.set(key, { name: m.stockItem.name, unit: m.stockItem.unit, totalQty: 0, count: 0 });
    const entry = byItem.get(key)!;
    entry.totalQty += m.qty;
    entry.count += 1;
  }
  const summary = [...byItem.values()].sort((a, b) => a.name.localeCompare(b.name));

  if (summary.length === 0) return <p className="py-8 text-center text-sm text-gray-400">{t("empty_no_usage")}</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        {movements.length} usage record{movements.length !== 1 ? "s" : ""} across {summary.length} item{summary.length !== 1 ? "s" : ""}.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:hidden">
        {summary.map((item) => (
          <div key={item.name} className="flex items-center justify-between rounded-xl border bg-white px-4 py-3 shadow-sm">
            <span className="font-medium text-gray-800">{item.name}</span>
            <span className="font-bold text-red-600 tabular-nums">{item.totalQty} {UNIT_LABEL[item.unit] ?? item.unit}</span>
          </div>
        ))}
      </div>
      <div className="hidden sm:block rounded-xl border bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left">{t("col_item")}</th>
              <th className="px-4 py-2 text-right">{t("col_total_used")}</th>
              <th className="px-4 py-2 text-right">{t("col_unit")}</th>
              <th className="px-4 py-2 text-right">{t("col_records")}</th>
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

async function ExpensesTab({ confirmExpense }: {
  confirmExpense: (fd: FormData) => Promise<void>;
}) {
  const t = await getT();

  function fmtDate(d: Date) { return d.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" }); }
  function fmtTime(d: Date) { return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }

  const [unconfirmed, confirmed] = await Promise.all([
    prisma.expense.findMany({
      where: { confirmedAt: null },
      include: { category: { select: { name: true } }, enteredBy: { select: { name: true } }, attachments: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.expense.findMany({
      where: { confirmedAt: { not: null } },
      include: {
        category: { select: { name: true } }, enteredBy: { select: { name: true } },
        confirmedBy: { select: { name: true } }, attachments: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-600">
          {t("badge_expense_awaiting")} ({unconfirmed.length})
        </h2>
        {unconfirmed.length === 0 ? (
          <p className="rounded-xl border bg-white px-4 py-6 text-center text-sm text-gray-400">
            {t("msg_all_confirmed")}
          </p>
        ) : (
          unconfirmed.map((e) => (
            <div key={e.id} className="rounded-xl border border-amber-100 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-bold tabular-nums">{formatMoney(e.amount)}</span>
                    <span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold " +
                      (e.paymentSource === "CASH_DRAWER" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700")}>
                      {e.paymentSource === "CASH_DRAWER" ? t("source_cash_drawer") : t("source_bank_transfer")}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm font-medium text-gray-800">{e.description}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {e.category.name}
                    {e.vendor && <> · {e.vendor}</>}
                    {" · "}{fmtDate(e.businessDate)} · {t("label_entered_by")} {e.enteredBy.name} {t("label_at")} {fmtTime(e.createdAt)}
                  </p>
                  {e.attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {e.attachments.map((a) => (
                        <a key={a.id} href={`/api/uploads/${a.filePath}`} target="_blank" rel="noopener noreferrer" className="block">
                          <img src={`/api/uploads/${a.filePath}`} alt="receipt"
                            className="h-20 w-20 rounded-lg border object-cover shadow-sm hover:opacity-80 transition" />
                        </a>
                      ))}
                    </div>
                  )}
                  {e.attachments.length === 0 && (
                    <p className="mt-1.5 text-[11px] italic text-gray-400">{t("label_no_receipt")}</p>
                  )}
                </div>
                <form action={confirmExpense} className="flex-shrink-0">
                  <input type="hidden" name="id" value={e.id} />
                  <button type="submit"
                    className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 active:scale-95 transition">
                    {t("btn_confirm")}
                  </button>
                </form>
              </div>
            </div>
          ))
        )}
      </div>

      {confirmed.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
            {t("badge_expense_confirmed")} — {t("label_last_50")}
          </h2>
          <div className="rounded-xl border bg-white divide-y overflow-hidden">
            {confirmed.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{formatMoney(e.amount)}</span>
                    <span className="text-sm text-gray-700">{e.description}</span>
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                      {t("badge_expense_confirmed")}
                    </span>
                    {e.attachments.length > 0 && (
                      <span className="text-[11px] text-gray-400">
                        {e.attachments.length} receipt{e.attachments.length > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">
                    {e.category.name}
                    {e.vendor && <> · {e.vendor}</>}
                    {" · "}{fmtDate(e.businessDate)}
                    {" · "}{t("label_confirmed_by")} {e.confirmedBy?.name}
                  </p>
                </div>
                {e.attachments.length > 0 && (
                  <div className="flex gap-1">
                    {e.attachments.slice(0, 3).map((a) => (
                      <a key={a.id} href={`/api/uploads/${a.filePath}`} target="_blank" rel="noopener noreferrer">
                        <img src={`/api/uploads/${a.filePath}`} alt="receipt"
                          className="h-10 w-10 rounded border object-cover hover:opacity-80" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

async function DailyReportTab({
  dayStr,
  submitDailyReport,
}: {
  dayStr: string;
  submitDailyReport: (fd: FormData) => Promise<void>;
}) {
  const t = await getT();
  const date = new Date(`${dayStr}T00:00:00`);
  const nextDay = new Date(date.getTime() + 24 * 60 * 60 * 1000);

  const [todayReports, pastReports] = await Promise.all([
    prisma.dailyReport.findMany({
      where: { date: { gte: date, lt: nextDay } },
      include: { createdBy: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.dailyReport.findMany({
      where: { date: { lt: date } },
      include: { createdBy: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  function fmtDate(d: Date) {
    return d.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric", weekday: "short" });
  }
  function fmtTime(d: Date) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="space-y-5">
      {/* Submit form */}
      <section className="rounded-xl bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">{t("heading_daily_report")} — {fmtDate(date)}</h3>
        <form action={submitDailyReport} className="space-y-3">
          <input type="hidden" name="date" value={dayStr} />
          <textarea
            name="content"
            rows={5}
            required
            placeholder={t("placeholder_daily_report")}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm leading-relaxed focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
          <div className="flex justify-end">
            <button type="submit"
              className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
              {t("btn_submit_report")}
            </button>
          </div>
        </form>
      </section>

      {/* Today's entries */}
      {todayReports.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Submitted today ({todayReports.length})
          </h3>
          {todayReports.map((r) => (
            <div key={r.id} className="rounded-xl border border-brand/20 bg-brand/5 px-4 py-3 shadow-sm">
              <div className="mb-1.5 flex items-center gap-2 text-xs text-gray-500">
                <span className="font-semibold text-gray-700">{r.createdBy.name}</span>
                <span>·</span>
                <span>{fmtTime(r.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed">{r.content}</p>
            </div>
          ))}
        </div>
      )}

      {todayReports.length === 0 && (
        <p className="text-center text-sm text-gray-400 py-2">{t("empty_no_daily_reports")}</p>
      )}

      {/* Past reports */}
      {pastReports.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Previous reports</h3>
          <div className="space-y-2">
            {pastReports.map((r) => (
              <div key={r.id} className="rounded-xl border bg-white px-4 py-3 shadow-sm">
                <div className="mb-1.5 flex items-center gap-2 text-xs text-gray-500">
                  <span className="font-medium text-gray-600">{fmtDate(r.date)}</span>
                  <span>·</span>
                  <span className="font-semibold text-gray-700">{r.createdBy.name}</span>
                  <span>·</span>
                  <span>{fmtTime(r.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">{r.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

async function DailySummaryTab({
  dayStr, start, end, c, settings,
}: {
  dayStr: string; start: Date; end: Date; c: string;
  settings: Awaited<ReturnType<typeof getSettings>>;
}) {
  const t = await getT();
  const date = new Date(`${dayStr}T00:00:00`);
  const nextDay = new Date(date.getTime() + 24 * 60 * 60 * 1000);

  const startMM = new Date(`${dayStr}T00:00:00+06:30`);
  const endMM   = new Date(startMM.getTime() + 24 * 60 * 60 * 1000);

  const [payments, closedSessions, expenses, attendances, dailyReports] = await Promise.all([
    prisma.payment.findMany({ where: { receivedAt: { gte: start, lt: end } } }),
    prisma.tableSession.findMany({
      where: { status: "CLOSED", closedAt: { gte: start, lt: end } },
      select: {
        adults: true, children: true, billTotal: true,
        payments: { select: { method: true, amount: true } },
        potOrders: { where: { voidedAt: null }, select: { id: true } },
      },
    }),
    prisma.expense.findMany({
      where: { businessDate: { gte: start, lt: end } },
      include: { category: { select: { name: true } } },
    }),
    prisma.attendance.findMany({
      where: {
        OR: [
          { clockInAt: { gte: startMM, lt: endMM } },
          { clockInAt: null as null, date: start },
        ],
      },
      include: { employee: { include: { user: { select: { name: true } } } } },
    }),
    prisma.dailyReport.findMany({
      where: { date: { gte: date, lt: nextDay } },
      include: { createdBy: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const sum = (arr: { amount: number }[]) => arr.reduce((s, x) => s + x.amount, 0);
  const grossCash = sum(payments.filter((p) => p.method === "CASH"));
  const kbz       = sum(payments.filter((p) => p.method === "KBZPAY"));
  const other      = sum(payments.filter((p) => p.method === "OTHER"));

  let cashChange = 0;
  for (const s of closedSessions) {
    if (s.payments.some((p) => p.method === "CASH")) {
      const totalPaid = s.payments.reduce((acc, p) => acc + p.amount, 0);
      cashChange += Math.max(0, totalPaid - (s.billTotal ?? totalPaid));
    }
  }
  const cash = grossCash - cashChange;
  const totalSales = cash + kbz + other;

  const adults   = closedSessions.reduce((s, x) => s + x.adults, 0);
  const children = closedSessions.reduce((s, x) => s + x.children, 0);
  let totalPots = 0, paidPots = 0;
  for (const s of closedSessions) {
    const total = s.potOrders.length;
    totalPots += total;
    paidPots += Math.max(0, total - freePotsAllowed(s.adults + s.children, settings.freePotRatio, settings.freePotRounding));
  }

  const totalExpenses = sum(expenses);
  const cashExpenses  = sum(expenses.filter((e) => e.paymentSource === "CASH_DRAWER"));
  const netCash       = cash - cashExpenses;

  const presentCount = attendances.filter((a) => ["PRESENT", "OT"].includes(a.status)).length;
  const absentCount  = attendances.filter((a) => a.status === "ABSENT").length;
  const leaveCount   = attendances.filter((a) => a.status === "LEAVE").length;
  const otCount      = attendances.filter((a) => a.status === "OT").length;

  function fmtTime(d: Date) { return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }

  return (
    <div className="space-y-5">
      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t("stat_total_sales")} value={formatMoney(totalSales, c)} accent />
        <Stat label={t("stat_bills_settled")} value={String(closedSessions.length)} />
        <Stat label={t("stat_covers")} value={`${adults} / ${children}`} />
        <Stat label={t("stat_pots")} value={`${paidPots} / ${totalPots}`} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Sales breakdown */}
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">{t("section_sales_by_method")}</h3>
          <dl className="space-y-1 text-sm">
            <Row label={t("row_cash")} value={formatMoney(cash, c)} />
            <Row label={t("row_kbzpay")} value={formatMoney(kbz, c)} />
            <Row label={t("row_other")} value={formatMoney(other, c)} />
            <div className="flex justify-between border-t border-gray-200 pt-1 font-bold">
              <span>{t("row_total")}</span>
              <span className="tabular-nums">{formatMoney(totalSales, c)}</span>
            </div>
            <div className="flex justify-between border-t border-gray-100 pt-1 text-xs text-gray-500">
              <span>{t("row_net_cash_movement")}</span>
              <span className="tabular-nums">{formatMoney(netCash, c)}</span>
            </div>
          </dl>
        </section>

        {/* Expenses */}
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">
            {t("section_expenses")} ({expenses.length})
          </h3>
          {expenses.length === 0 ? (
            <p className="text-sm text-gray-400">{t("empty_no_expenses")}</p>
          ) : (
            <>
              <ul className="divide-y divide-gray-100 text-sm">
                {expenses.map((e) => (
                  <li key={e.id} className="flex items-center justify-between py-1.5">
                    <span className="truncate text-gray-700 max-w-[60%]">{e.description}
                      <span className="ml-1 text-xs text-gray-400">({e.category.name})</span>
                    </span>
                    <span className="tabular-nums font-medium">{formatMoney(e.amount, c)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-1.5 flex justify-between border-t border-gray-200 pt-1.5 text-sm font-bold">
                <span>{t("row_total")}</span>
                <span className="tabular-nums text-red-600">{formatMoney(totalExpenses, c)}</span>
              </div>
            </>
          )}
        </section>

        {/* Attendance */}
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">{t("tab_attendance")}</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-green-50 px-3 py-2 text-center">
              <div className="text-xl font-bold text-green-700">{presentCount}</div>
              <div className="text-xs text-green-600">Present</div>
            </div>
            <div className="rounded-lg bg-purple-50 px-3 py-2 text-center">
              <div className="text-xl font-bold text-purple-700">{otCount}</div>
              <div className="text-xs text-purple-600">OT</div>
            </div>
            <div className="rounded-lg bg-blue-50 px-3 py-2 text-center">
              <div className="text-xl font-bold text-blue-700">{leaveCount}</div>
              <div className="text-xs text-blue-600">Leave</div>
            </div>
            <div className="rounded-lg bg-red-50 px-3 py-2 text-center">
              <div className="text-xl font-bold text-red-600">{absentCount}</div>
              <div className="text-xs text-red-500">Absent</div>
            </div>
          </div>
          {attendances.filter((a) => ["PRESENT", "OT"].includes(a.status)).length > 0 && (
            <ul className="mt-3 divide-y divide-gray-100 text-xs text-gray-600">
              {attendances
                .filter((a) => ["PRESENT", "OT"].includes(a.status))
                .sort((a, b) => (a.employee.user.name > b.employee.user.name ? 1 : -1))
                .map((a) => (
                  <li key={a.id} className="flex justify-between py-1">
                    <span>{a.employee.user.name}</span>
                    <span className="text-gray-400">{fmtTime(a.clockInAt!)} – {a.clockOutAt ? fmtTime(a.clockOutAt) : "—"}</span>
                  </li>
                ))}
            </ul>
          )}
        </section>
      </div>

      {/* Manager daily reports */}
      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">
          {t("heading_daily_report")} ({dailyReports.length})
        </h3>
        {dailyReports.length === 0 ? (
          <p className="text-sm text-gray-400">{t("empty_no_daily_reports")}</p>
        ) : (
          <div className="space-y-3">
            {dailyReports.map((r) => (
              <div key={r.id} className="rounded-xl border border-brand/20 bg-brand/5 px-4 py-3">
                <div className="mb-1.5 flex items-center gap-2 text-xs text-gray-500">
                  <span className="font-semibold text-gray-700">{r.createdBy.name}</span>
                  <span>·</span>
                  <span>{fmtTime(r.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed">{r.content}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

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
