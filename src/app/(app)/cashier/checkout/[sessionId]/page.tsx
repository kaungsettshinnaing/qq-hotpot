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
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

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
  const t = await getT();

  const detail = await getSessionDetail(sessionId);
  if (!detail) redirect("/cashier");

  const shift = await getOpenShift(user.id);
  const { session, bill, paid, balance, settings } = detail;
  const tableLabel = [session.table.label, ...session.mergedTables.map((m) => m.table.label)].join(" + ");
  const isOpen = session.status === "OPEN";
  const isSettled = session.status === "CLOSED" || settled === "1";
  const change = paid > bill.total ? paid - bill.total : 0;

  const METHOD_LABEL: Record<string, string> = {
    CASH:   t("method_cash"),
    KBZPAY: t("method_kbzpay"),
    OTHER:  t("method_other"),
  };

  return (
    <div className="space-y-4">
      <LiveRefresh room="floor" events={["table:update"]} seconds={15} />

      <div className="flex flex-wrap items-center justify-between gap-2 no-print">
        <div className="flex items-center gap-3">
          <Link href="/cashier" className="text-sm text-brand hover:underline">← {t("nav_cashier")}</Link>
          <h1 className="text-xl font-bold">
            {t("heading_checkout")} — Table {tableLabel}
            <span className="ml-2 text-sm font-normal text-gray-400">{detail.diners} pax</span>
          </h1>
        </div>
        <PrintButton className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50" />
      </div>

      {isSettled && (
        <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 no-print">
          {t("banner_bill_settled")}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">{t("section_bill")}</h3>
            <BillSummary bill={bill} currency={settings.currency} />
          </section>

          <section className="rounded-xl bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">{t("section_payments")}</h3>
              <span className="text-sm">
                {t("label_paid")} <span className="font-semibold">{formatMoney(paid, settings.currency)}</span>
              </span>
            </div>
            <ul className="space-y-1">
              {session.payments.length === 0 && (
                <li className="text-sm text-gray-400">{t("empty_no_payments")}</li>
              )}
              {session.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-1.5 text-sm">
                  <span>
                    {METHOD_LABEL[p.method] ?? p.method}
                    {p.reference ? <span className="text-gray-400"> · {p.reference}</span> : null}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-medium tabular-nums">{formatMoney(p.amount, settings.currency)}</span>
                    {isOpen && (
                      <form action={voidPayment}>
                        <input type="hidden" name="paymentId" value={p.id} />
                        <button className="rounded border border-red-200 px-1.5 text-xs text-red-600 hover:bg-red-50">✕</button>
                      </form>
                    )}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-3 border-t border-gray-200 pt-2 text-sm">
              <div className="flex justify-between">
                <span>{t("label_balance")}</span>
                <span className={"font-bold tabular-nums " + (balance > 0 ? "text-red-600" : "text-emerald-600")}>
                  {formatMoney(balance, settings.currency)}
                </span>
              </div>
              {change > 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>{t("label_change")}</span>
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
                    ? `${t("btn_collect_to_settle")} ${formatMoney(balance, settings.currency)}`
                    : t("btn_settle_free_table")}
                </button>
              </form>
            )}
          </section>
        </div>

        <div>
          {isOpen ? (
            <CheckoutClient
              sessionId={session.id}
              currency={settings.currency}
              balance={balance}
              hasOpenShift={!!shift}
              discount={
                session.discountType
                  ? { type: session.discountType, value: session.discountValue ?? 0, reason: session.discountReason }
                  : null
              }
              labels={{
                sectionDiscount:       t("section_discount"),
                labelType:             t("label_discount_type"),
                optionFixed:           t("option_fixed"),
                optionPercent:         t("option_percent"),
                labelValue:            t("label_discount_value"),
                labelReason:           t("label_discount_reason"),
                placeholderReason:     t("placeholder_discount_reason"),
                btnApply:              t("btn_apply"),
                btnRemove:             t("btn_remove"),
                sectionPayment:        t("section_take_payment"),
                warningOpenShift:      t("warning_open_shift_first"),
                labelMethod:           t("label_payment_method"),
                methodCash:            t("method_cash"),
                methodKBZ:             t("method_kbzpay"),
                methodOther:           t("method_other"),
                labelAmount:           t("label_payment_amount"),
                labelReference:        t("label_reference"),
                placeholderReference:  t("placeholder_reference"),
                btnAddPayment:         t("btn_add_payment"),
              }}
            />
          ) : (
            <div className="rounded-xl bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
              {t("bill_closed_message")}
            </div>
          )}
        </div>
      </div>

      {/* Printable receipt */}
      <div className="receipt">
        <div style={{ textAlign: "center", fontWeight: 700, fontSize: 14 }}>{settings.restaurantName}</div>
        <div style={{ textAlign: "center", fontSize: 11 }}>Table {tableLabel} · {detail.diners} pax</div>
        <div style={{ textAlign: "center", fontSize: 11 }}>{formatDateTime(session.closedAt ?? new Date())}</div>
        <hr />
        {bill.lines.map((l) => (
          <div key={l.code} style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{l.label} {l.qty}×{l.unitPrice}</span>
            <span>{l.amount.toLocaleString()}</span>
          </div>
        ))}
        <hr />
        <Line label={t("receipt_subtotal")} value={bill.subtotal} />
        {bill.discount > 0 && <Line label={t("bill_discount")} value={-bill.discount} />}
        {bill.serviceCharge > 0 && <Line label={t("receipt_service")} value={bill.serviceCharge} />}
        {bill.tax > 0 && <Line label={t("receipt_tax")} value={bill.tax} />}
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
          <span>{t("receipt_total")}</span>
          <span>{bill.total.toLocaleString()}</span>
        </div>
        <hr />
        {session.payments.map((p) => (
          <Line key={p.id} label={METHOD_LABEL[p.method] ?? p.method} value={p.amount} />
        ))}
        {change > 0 && <Line label={t("receipt_change")} value={change} />}
        <div style={{ textAlign: "center", marginTop: 6, fontSize: 11 }}>
          {t("receipt_thank_you")} — {settings.currency}
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
