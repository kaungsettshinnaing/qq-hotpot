import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

// ── Server actions ────────────────────────────────────────────────────────────

async function markReceived(fd: FormData) {
  "use server";
  await requireAnyRole(["ADMIN"]);
  const id = fd.get("id") as string;
  await prisma.payment.update({ where: { id }, data: { reconciledAt: new Date() } });
  revalidatePath("/accounting");
}

async function markPaid(fd: FormData) {
  "use server";
  await requireAnyRole(["ADMIN"]);
  const id = fd.get("id") as string;
  await prisma.expense.update({ where: { id }, data: { paidAt: new Date() } });
  revalidatePath("/accounting");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(d: Date | null | undefined) {
  if (!d) return "—";
  return d.toLocaleString([], {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtDate(d: Date) {
  return d.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" });
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireAnyRole(["ADMIN"]);
  const { tab = "ar" } = await searchParams;

  const [pendingPayments, reconciledPayments, pendingExpenses, paidExpenses] =
    await Promise.all([
      // AR — pending: KBZPay/OTHER not yet reconciled
      prisma.payment.findMany({
        where: { method: { in: ["KBZPAY", "OTHER"] }, reconciledAt: null },
        include: {
          session: { include: { table: { select: { label: true } } } },
          receivedBy: { select: { name: true } },
        },
        orderBy: { receivedAt: "asc" },
      }),
      // AR — reconciled history
      prisma.payment.findMany({
        where: { method: { in: ["KBZPAY", "OTHER"] }, reconciledAt: { not: null } },
        include: {
          session: { include: { table: { select: { label: true } } } },
          receivedBy: { select: { name: true } },
        },
        orderBy: { receivedAt: "asc" },
      }),
      // AP — pending: BANK_TRANSFER expenses not yet confirmed paid
      prisma.expense.findMany({
        where: { paymentSource: "BANK_TRANSFER", paidAt: null },
        include: {
          category: { select: { name: true } },
          enteredBy: { select: { name: true } },
        },
        orderBy: { businessDate: "asc" },
      }),
      // AP — paid history
      prisma.expense.findMany({
        where: { paymentSource: "BANK_TRANSFER", paidAt: { not: null } },
        include: {
          category: { select: { name: true } },
          enteredBy: { select: { name: true } },
        },
        orderBy: { businessDate: "asc" },
      }),
    ]);

  const pendingARTotal = pendingPayments.reduce((s, p) => s + p.amount, 0);
  const pendingAPTotal = pendingExpenses.reduce((s, e) => s + e.amount, 0);

  const tabs = [
    { key: "ar", label: "Accounts Receivable" },
    { key: "ap", label: "Accounts Payable" },
  ];

  return (
    <div className="space-y-5 px-4 py-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900">Accounting</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Pending receivable</p>
          <p className="mt-1 text-2xl font-extrabold text-blue-700">
            {formatMoney(pendingARTotal)}
          </p>
          <p className="text-xs text-gray-400">{pendingPayments.length} transactions</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Pending payable</p>
          <p className="mt-1 text-2xl font-extrabold text-red-700">
            {formatMoney(pendingAPTotal)}
          </p>
          <p className="text-xs text-gray-400">{pendingExpenses.length} transactions</p>
        </div>
      </div>

      {/* Tab strip */}
      <div className="flex gap-1 border-b">
        {tabs.map((t) => (
          <a
            key={t.key}
            href={`/accounting?tab=${t.key}`}
            className={
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors " +
              (tab === t.key
                ? "border-brand-dark text-brand-dark"
                : "border-transparent text-gray-500 hover:text-gray-700")
            }
          >
            {t.label}
            {t.key === "ar" && pendingPayments.length > 0 && (
              <span className="ml-1.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                {pendingPayments.length}
              </span>
            )}
            {t.key === "ap" && pendingExpenses.length > 0 && (
              <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                {pendingExpenses.length}
              </span>
            )}
          </a>
        ))}
      </div>

      {/* ── Accounts Receivable ── */}
      {tab === "ar" && (
        <div className="space-y-5">
          {/* Pending */}
          {pendingPayments.length > 0 ? (
            <div className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                Pending reconciliation ({pendingPayments.length})
              </h2>
              {pendingPayments.map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-900">
                        {formatMoney(p.amount)}
                      </span>
                      <span
                        className={
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold " +
                          (p.method === "KBZPAY"
                            ? "bg-purple-100 text-purple-700"
                            : "bg-gray-100 text-gray-600")
                        }
                      >
                        {p.method}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">
                      Table {p.session.table.label} &nbsp;·&nbsp; {fmt(p.receivedAt)}
                    </p>
                    {p.reference && (
                      <p className="text-xs text-gray-400">Ref: {p.reference}</p>
                    )}
                    <p className="text-[11px] text-gray-400">
                      Received by {p.receivedBy.name}
                    </p>
                  </div>
                  <form action={markReceived}>
                    <input type="hidden" name="id" value={p.id} />
                    <button
                      type="submit"
                      className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 active:scale-95 transition"
                    >
                      Received
                    </button>
                  </form>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-gray-400">
              No pending receivables — all caught up.
            </p>
          )}

          {/* Reconciled history */}
          {reconciledPayments.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Reconciled history ({reconciledPayments.length})
              </h2>
              <div className="rounded-xl border bg-white divide-y overflow-hidden">
                {reconciledPayments.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-gray-900">
                          {formatMoney(p.amount)}
                        </span>
                        <span
                          className={
                            "rounded-full px-2 py-0.5 text-[11px] font-semibold " +
                            (p.method === "KBZPAY"
                              ? "bg-purple-100 text-purple-700"
                              : "bg-gray-100 text-gray-600")
                          }
                        >
                          {p.method}
                        </span>
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                          Received
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-gray-400">
                        Table {p.session.table.label} &nbsp;·&nbsp; {fmt(p.receivedAt)}
                        {p.reference && <> &nbsp;·&nbsp; Ref: {p.reference}</>}
                      </p>
                    </div>
                    <p className="text-xs text-gray-400">
                      Confirmed {fmt(p.reconciledAt)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Accounts Payable ── */}
      {tab === "ap" && (
        <div className="space-y-5">
          {/* Pending */}
          {pendingExpenses.length > 0 ? (
            <div className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-red-600">
                Pending payment ({pendingExpenses.length})
              </h2>
              {pendingExpenses.map((e) => (
                <div
                  key={e.id}
                  className="rounded-xl border border-red-100 bg-white p-4 shadow-sm flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-900">
                        {formatMoney(e.amount)}
                      </span>
                      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-700">
                        Bank Transfer
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-gray-700">{e.description}</p>
                    <p className="text-xs text-gray-500">
                      {e.category.name}
                      {e.vendor && <> &nbsp;·&nbsp; {e.vendor}</>}
                      &nbsp;·&nbsp; {fmtDate(e.businessDate)}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      Entered by {e.enteredBy.name}
                    </p>
                  </div>
                  <form action={markPaid}>
                    <input type="hidden" name="id" value={e.id} />
                    <button
                      type="submit"
                      className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 active:scale-95 transition"
                    >
                      Paid
                    </button>
                  </form>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-gray-400">
              No pending payables — all cleared.
            </p>
          )}

          {/* Paid history */}
          {paidExpenses.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Payment history ({paidExpenses.length})
              </h2>
              <div className="rounded-xl border bg-white divide-y overflow-hidden">
                {paidExpenses.map((e) => (
                  <div
                    key={e.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-gray-900">
                          {formatMoney(e.amount)}
                        </span>
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                          Paid
                        </span>
                      </div>
                      <p className="text-sm text-gray-700">{e.description}</p>
                      <p className="text-xs text-gray-400">
                        {e.category.name}
                        {e.vendor && <> &nbsp;·&nbsp; {e.vendor}</>}
                        &nbsp;·&nbsp; {fmtDate(e.businessDate)}
                      </p>
                    </div>
                    <p className="text-xs text-gray-400">
                      Confirmed {fmt(e.paidAt)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
