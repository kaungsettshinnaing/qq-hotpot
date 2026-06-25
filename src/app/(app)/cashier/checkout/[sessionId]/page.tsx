import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAnyRole } from "@/lib/auth";
import { getSessionDetail } from "@/lib/orders";
import { getOpenShift } from "@/lib/shift";
import { formatMoney, formatDateTime } from "@/lib/format";
import BillSummary from "@/components/BillSummary";
import LiveRefresh from "@/components/LiveRefresh";
import CheckoutClient from "./CheckoutClient";
import PrintButton from "./PrintButton";
import { voidPayment, settleSession } from "../../actions";

export const dynamic = "force-dynamic";

const METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  KBZPAY: "KBZPay",
  OTHER: "Other",
};

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ settled?: string }>;
}) {
  const user = await requireAnyRole(["CASHIER", "MANAGER", "ADMIN"]);
  const { sessionId } = await params;
  const { settled } = await searchParams;

  const detail = await getSessionDetail(sessionId);
  if (!detail) redirect("/cashier");

  const shift = await getOpenShift(user.id);
  const { session, bill, paid, balance, settings } = detail;
  const isOpen = session.status === "OPEN";
  const isSettled = session.status === "CLOSED" || settled === "1";
  const change = paid > bill.total ? paid - bill.total : 0;

  return (
    <div className="space-y-4">
      <LiveRefresh room="floor" events={["table:update"]} seconds={15} />

      <div className="flex flex-wrap items-center justify-between gap-2 no-print">
        <div className="flex items-center gap-3">
          <Link href="/cashier" className="text-sm text-brand hover:underline">
            ← Cashier
          </Link>
          <h1 className="text-xl font-bold">
            Checkout — Table {session.table.label}
            <span className="ml-2 text-sm font-normal text-gray-400">{detail.diners} pax</span>
          </h1>
        </div>
        <PrintButton className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50" />
      </div>

      {isSettled && (
        <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 no-print">
          ✅ Bill settled. You can print the receipt.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Left: bill + payments */}
        <div className="space-y-4">
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">Bill</h3>
            <BillSummary bill={bill} currency={settings.currency} />
          </section>

          <section className="rounded-xl bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Payments</h3>
              <span className="text-sm">
                Paid{" "}
                <span className="font-semibold">{formatMoney(paid, settings.currency)}</span>
              </span>
            </div>
            <ul className="space-y-1">
              {session.payments.length === 0 && (
                <li className="text-sm text-gray-400">No payments yet.</li>
              )}
              {session.payments.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-1.5 text-sm"
                >
                  <span>
                    {METHOD_LABEL[p.method] ?? p.method}
                    {p.reference ? (
                      <span className="text-gray-400"> · {p.reference}</span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-medium tabular-nums">
                      {formatMoney(p.amount, settings.currency)}
                    </span>
                    {isOpen && (
                      <form action={voidPayment}>
                        <input type="hidden" name="paymentId" value={p.id} />
                        <button className="rounded border border-red-200 px-1.5 text-xs text-red-600 hover:bg-red-50">
                          ✕
                        </button>
                      </form>
                    )}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-3 border-t border-gray-200 pt-2 text-sm">
              <div className="flex justify-between">
                <span>Balance</span>
                <span
                  className={
                    "font-bold tabular-nums " + (balance > 0 ? "text-red-600" : "text-emerald-600")
                  }
                >
                  {formatMoney(balance, settings.currency)}
                </span>
              </div>
              {change > 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>Change</span>
                  <span className="tabular-nums">{formatMoney(change, settings.currency)}</span>
                </div>
              )}
            </div>

            {isOpen && (
              <form action={settleSession} className="mt-3">
                <input type="hidden" name="sessionId" value={session.id} />
                <button
                  disabled={balance > 0}
                  className="w-full rounded-lg bg-emerald-600 py-2.5 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {balance > 0
                    ? `Collect ${formatMoney(balance, settings.currency)} to settle`
                    : "✓ Settle & free table"}
                </button>
              </form>
            )}
          </section>
        </div>

        {/* Right: discount + payment input (only while open) */}
        <div>
          {isOpen ? (
            <CheckoutClient
              sessionId={session.id}
              currency={settings.currency}
              balance={balance}
              hasOpenShift={!!shift}
              discount={
                session.discountType
                  ? {
                      type: session.discountType,
                      value: session.discountValue ?? 0,
                      reason: session.discountReason,
                    }
                  : null
              }
            />
          ) : (
            <div className="rounded-xl bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
              This bill is closed.
            </div>
          )}
        </div>
      </div>

      {/* Printable receipt */}
      <div className="receipt">
        <div style={{ textAlign: "center", fontWeight: 700, fontSize: 14 }}>
          {settings.restaurantName}
        </div>
        <div style={{ textAlign: "center", fontSize: 11 }}>
          Table {session.table.label} · {detail.diners} pax
        </div>
        <div style={{ textAlign: "center", fontSize: 11 }}>
          {formatDateTime(session.closedAt ?? new Date())}
        </div>
        <hr />
        {bill.lines.map((l) => (
          <div key={l.code} style={{ display: "flex", justifyContent: "space-between" }}>
            <span>
              {l.label} {l.qty}×{l.unitPrice}
            </span>
            <span>{l.amount.toLocaleString()}</span>
          </div>
        ))}
        <hr />
        <Line label="Subtotal" value={bill.subtotal} />
        {bill.discount > 0 && <Line label="Discount" value={-bill.discount} />}
        {bill.serviceCharge > 0 && <Line label="Service" value={bill.serviceCharge} />}
        {bill.tax > 0 && <Line label="Tax" value={bill.tax} />}
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
          <span>TOTAL</span>
          <span>{bill.total.toLocaleString()}</span>
        </div>
        <hr />
        {session.payments.map((p) => (
          <Line key={p.id} label={METHOD_LABEL[p.method] ?? p.method} value={p.amount} />
        ))}
        {change > 0 && <Line label="Change" value={change} />}
        <div style={{ textAlign: "center", marginTop: 6, fontSize: 11 }}>
          Thank you! — {settings.currency}
        </div>
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span>{label}</span>
      <span>{value.toLocaleString()}</span>
    </div>
  );
}
