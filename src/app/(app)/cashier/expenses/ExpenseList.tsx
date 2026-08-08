"use client";

import { useState } from "react";
import { formatMoney, formatTime } from "@/lib/format";

interface ExpenseLine {
  id: string;
  description: string;
  unit: string | null;
  qty: number;
  price: number;
}

interface ExpenseAttachment {
  id: string;
  filePath: string;
}

interface Expense {
  id: string;
  description: string;
  amount: number;
  paymentSource: string;
  invoiceType: string | null;
  confirmedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  vendor: string | null;
  category: { name: string };
  lines: ExpenseLine[];
  attachments: ExpenseAttachment[];
}

type Filter = "ALL" | "CASH_DRAWER" | "BANK_TRANSFER";

interface ExpenseListLabels {
  heading: string;
  filterAll: string;
  filterCash: string;
  filterBank: string;
  empty: string;
  badgeStock: string;
  badgeNonStock: string;
  badgeRejected: string;
  badgeConfirmed: string;
  badgeAwaiting: string;
  sourceCashDrawer: string;
  sourceBankTransfer: string;
  rejectedReasonTemplate: string; // contains "{reason}"
  rejectedByManager: string;
  altReceipt: string;
}

export default function ExpenseList({
  expenses,
  currency,
  labels,
}: {
  expenses: Expense[];
  currency: string;
  labels: ExpenseListLabels;
}) {
  const [filter, setFilter] = useState<Filter>("ALL");

  const filtered =
    filter === "ALL" ? expenses : expenses.filter((e) => e.paymentSource === filter);

  const cashCount = expenses.filter((e) => e.paymentSource === "CASH_DRAWER").length;
  const bankCount = expenses.filter((e) => e.paymentSource === "BANK_TRANSFER").length;

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: "ALL", label: labels.filterAll, count: expenses.length },
    { key: "CASH_DRAWER", label: labels.filterCash, count: cashCount },
    { key: "BANK_TRANSFER", label: labels.filterBank, count: bankCount },
  ];

  return (
    <div className="rounded-xl bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
        <h3 className="text-sm font-semibold text-gray-700">
          {labels.heading} ({filtered.length})
        </h3>
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={
                "rounded-full px-2.5 py-0.5 text-xs font-semibold transition " +
                (filter === tab.key
                  ? "bg-brand text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200")
              }
            >
              {tab.label} {tab.count > 0 && <span className="opacity-75">({tab.count})</span>}
            </button>
          ))}
        </div>
      </div>

      <ul className="divide-y divide-gray-100">
        {filtered.length === 0 && (
          <li className="px-4 py-3 text-sm text-gray-400">{labels.empty}</li>
        )}
        {filtered.map((e) => (
          <li key={e.id} className="px-4 py-2.5 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">{e.description}</span>
                  <span className="text-xs text-gray-400">{e.category.name}</span>
                  {e.invoiceType && (
                    <span
                      className={
                        "rounded-full px-1.5 py-0.5 text-[10px] font-semibold " +
                        (e.invoiceType === "STOCK"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-100 text-gray-600")
                      }
                    >
                      {e.invoiceType === "STOCK" ? labels.badgeStock : labels.badgeNonStock}
                    </span>
                  )}
                  {e.rejectedAt ? (
                    <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                      {labels.badgeRejected}
                    </span>
                  ) : e.confirmedAt ? (
                    <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
                      {labels.badgeConfirmed}
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                      {labels.badgeAwaiting}
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-400">
                  {e.paymentSource === "CASH_DRAWER" ? labels.sourceCashDrawer : labels.sourceBankTransfer}
                  {e.vendor ? ` · ${e.vendor}` : ""} · {formatTime(new Date(e.createdAt))}
                </div>
                {e.rejectedAt && (
                  <div className="mt-0.5 text-xs font-medium text-red-600">
                    {e.rejectionReason
                      ? labels.rejectedReasonTemplate.replace("{reason}", e.rejectionReason)
                      : labels.rejectedByManager}
                  </div>
                )}

                {e.lines.length > 0 && (
                  <div className="mt-1.5 space-y-0.5">
                    {e.lines.map((line) => (
                      <div
                        key={line.id}
                        className="flex items-center justify-between text-[11px] text-gray-500"
                      >
                        <span>
                          {line.description}
                          {line.unit ? (
                            <span className="text-gray-400">
                              {" "}
                              · {line.qty} {line.unit}
                            </span>
                          ) : (
                            ""
                          )}
                        </span>
                        <span className="tabular-nums">{line.price.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}

                {e.attachments.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {e.attachments.map((a) => (
                      <a
                        key={a.id}
                        href={`/api/uploads/${a.filePath}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <img
                          src={`/api/uploads/${a.filePath}`}
                          alt={labels.altReceipt}
                          className="h-12 w-12 rounded border object-cover hover:opacity-80"
                        />
                      </a>
                    ))}
                  </div>
                )}
              </div>
              <span className="flex-shrink-0 font-semibold tabular-nums">
                {formatMoney(e.amount, currency)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
