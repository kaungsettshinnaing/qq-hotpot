"use client";

import { Fragment, useState } from "react";
import { formatMoney } from "@/lib/format";

interface Line {
  label: string;
  qty: number;
  unitLabel: string;
  unitPrice: number;
  amount: number;
}

export interface MovementRow {
  id: string;
  tableLabel: string;
  adults: number;
  children: number;
  revenue: number;
  start: string;
  end: string;
  lines: Line[];
  subtotal: number;
  discount: number;
  serviceCharge: number;
  tax: number;
  total: number;
}

interface MovementsTableLabels {
  colTable: string;
  colDiners: string;
  colRevenue: string;
  colStart: string;
  colEnd: string;
  empty: string;
  emptyLineItems: string;
  subtotal: string;
  discount: string;
  serviceCharge: string;
  tax: string;
  billTotal: string;
  total: string;
}

export default function MovementsTable({
  rows,
  currency,
  totalAdults,
  totalChildren,
  totalRevenue,
  labels,
}: {
  rows: MovementRow[];
  currency: string;
  totalAdults: number;
  totalChildren: number;
  totalRevenue: number;
  labels: MovementsTableLabels;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (rows.length === 0) {
    return <p className="text-sm text-gray-400">{labels.empty}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b text-left text-xs uppercase text-gray-400">
          <tr>
            <th className="px-2 py-1.5">{labels.colTable}</th>
            <th className="px-2 py-1.5 text-center">{labels.colDiners}</th>
            <th className="px-2 py-1.5 text-right">{labels.colRevenue}</th>
            <th className="px-2 py-1.5 text-right">{labels.colStart}</th>
            <th className="px-2 py-1.5 text-right">{labels.colEnd}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => {
            const open = openId === r.id;
            return (
              <Fragment key={r.id}>
                <tr className="cursor-pointer hover:bg-gray-50" onClick={() => setOpenId(open ? null : r.id)}>
                  <td className="px-2 py-1.5 font-medium">
                    <span className="mr-1 inline-block w-3 text-gray-400">{open ? "▾" : "▸"}</span>
                    {r.tableLabel}
                  </td>
                  <td className="px-2 py-1.5 text-center tabular-nums">{r.adults} / {r.children}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatMoney(r.revenue, currency)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-gray-500">{r.start}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-gray-500">{r.end}</td>
                </tr>
                {open && (
                  <tr className="bg-gray-50/60">
                    <td colSpan={5} className="px-4 py-2">
                      <div className="space-y-0.5 text-xs">
                        {r.lines.length === 0 ? (
                          <p className="text-gray-400">{labels.emptyLineItems}</p>
                        ) : (
                          r.lines.map((l, i) => (
                            <div key={i} className="flex justify-between text-gray-600">
                              <span>
                                {l.label}
                                <span className="text-gray-400">
                                  {" "}× {l.qty}{l.unitLabel ? ` ${l.unitLabel}` : ""} @ {formatMoney(l.unitPrice, currency)}
                                </span>
                              </span>
                              <span className="tabular-nums">{formatMoney(l.amount, currency)}</span>
                            </div>
                          ))
                        )}
                        <div className="mt-1 flex justify-between border-t border-gray-200 pt-1 text-gray-500">
                          <span>{labels.subtotal}</span>
                          <span className="tabular-nums">{formatMoney(r.subtotal, currency)}</span>
                        </div>
                        {r.discount > 0 && (
                          <div className="flex justify-between text-red-500">
                            <span>{labels.discount}</span>
                            <span className="tabular-nums">−{formatMoney(r.discount, currency)}</span>
                          </div>
                        )}
                        {r.serviceCharge > 0 && (
                          <div className="flex justify-between text-gray-500">
                            <span>{labels.serviceCharge}</span>
                            <span className="tabular-nums">{formatMoney(r.serviceCharge, currency)}</span>
                          </div>
                        )}
                        {r.tax > 0 && (
                          <div className="flex justify-between text-gray-500">
                            <span>{labels.tax}</span>
                            <span className="tabular-nums">{formatMoney(r.tax, currency)}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-semibold text-gray-800">
                          <span>{labels.billTotal}</span>
                          <span className="tabular-nums">{formatMoney(r.total, currency)}</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t font-bold">
            <td className="px-2 py-1.5">{labels.total}</td>
            <td className="px-2 py-1.5 text-center tabular-nums">{totalAdults} / {totalChildren}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{formatMoney(totalRevenue, currency)}</td>
            <td className="px-2 py-1.5" />
            <td className="px-2 py-1.5" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
