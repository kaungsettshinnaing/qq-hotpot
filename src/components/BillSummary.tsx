import type { Bill } from "@/lib/pricing";
import { formatMoney, formatNumber } from "@/lib/format";

export default function BillSummary({
  bill,
  currency,
  labels,
}: {
  bill: Bill;
  currency: string;
  labels?: {
    noItems: string;
    subtotal: string;
    discount: string;
    serviceCharge: string;
    tax: string;
    total: string;
  };
}) {
  const l = labels ?? {
    noItems: "No items yet.",
    subtotal: "Subtotal",
    discount: "Discount",
    serviceCharge: "Service charge",
    tax: "Tax",
    total: "Total",
  };
  return (
    <div className="text-sm">
      <table className="w-full">
        <tbody>
          {bill.lines.length === 0 && (
            <tr>
              <td className="py-2 text-gray-400" colSpan={3}>
                {l.noItems}
              </td>
            </tr>
          )}
          {bill.lines.map((l) => (
            <tr key={l.code} className="border-b border-gray-100">
              <td className="py-1.5">
                {l.label}
                <span className="text-gray-400">
                  {" "}
                  · {formatNumber(l.qty)} {l.unitLabel} × {formatNumber(l.unitPrice)}
                </span>
              </td>
              <td className="py-1.5 text-right tabular-nums">{formatNumber(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-2 space-y-1">
        <Row label={l.subtotal} value={formatMoney(bill.subtotal, currency)} />
        {bill.discount > 0 && (
          <Row label={l.discount} value={`− ${formatMoney(bill.discount, currency)}`} muted />
        )}
        {bill.serviceCharge > 0 && (
          <Row label={l.serviceCharge} value={formatMoney(bill.serviceCharge, currency)} />
        )}
        {bill.tax > 0 && <Row label={l.tax} value={formatMoney(bill.tax, currency)} />}
        <div className="flex items-center justify-between border-t border-gray-300 pt-2 text-base font-bold">
          <span>{l.total}</span>
          <span className="tabular-nums">{formatMoney(bill.total, currency)}</span>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className={"flex items-center justify-between " + (muted ? "text-gray-500" : "")}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
