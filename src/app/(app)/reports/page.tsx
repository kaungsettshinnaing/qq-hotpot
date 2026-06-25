import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { freePotsAllowed } from "@/lib/pricing";
import { formatMoney, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function dayString(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await requireAnyRole(["MANAGER", "ADMIN"]);
  const settings = await getSettings();
  const c = settings.currency;

  const { date } = await searchParams;
  const today = dayString(new Date());
  const dayStr = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;
  const start = new Date(`${dayStr}T00:00:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

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
  let totalPots = 0;
  let paidPots = 0;
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Daily Report</h1>
        <form method="get" className="flex items-center gap-2 text-sm">
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
        <h3 className="mb-2 text-sm font-semibold text-gray-700">
          Expenses ({expenses.length})
        </h3>
        {expenses.length === 0 ? (
          <p className="text-sm text-gray-400">No expenses.</p>
        ) : (
          <ul className="divide-y divide-gray-100 text-sm">
            {expenses.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-1.5">
                <span>
                  {e.description}
                  <span className="ml-2 text-xs text-gray-400">
                    {e.category.name} ·{" "}
                    {e.paymentSource === "CASH_DRAWER" ? "Cash" : "Bank"}
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
                <span
                  className={
                    "font-semibold tabular-nums " +
                    ((s.variance ?? 0) < 0 ? "text-red-600" : (s.variance ?? 0) > 0 ? "text-amber-600" : "text-emerald-600")
                  }
                >
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
