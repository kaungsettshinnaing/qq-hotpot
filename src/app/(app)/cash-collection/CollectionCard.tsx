"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format";

export default function CollectionCard({
  type,
  standing,
  currency,
  action,
  title,
  subtitle,
  notePlaceholder,
  submitLabel,
  standingLabel,
  overLabel,
  labelAmount,
  labelNote,
}: {
  type: "COLLECT" | "INJECT";
  standing: number;
  currency: string;
  action: (fd: FormData) => Promise<void>;
  title: string;
  subtitle: string;
  notePlaceholder: string;
  submitLabel: string;
  standingLabel: string;
  overLabel: string;
  labelAmount: string;
  labelNote: string;
}) {
  const [amount, setAmount] = useState("");
  const isCollect = type === "COLLECT";
  const amt = Math.max(0, Math.round(Number(amount) || 0));
  const after = isCollect ? standing - amt : standing + amt;

  return (
    <div className={`rounded-xl border-2 bg-white p-4 shadow-sm ${isCollect ? "border-red-200" : "border-green-200"}`}>
      <h3 className={`text-sm font-semibold ${isCollect ? "text-red-700" : "text-green-700"}`}>
        {title}
      </h3>
      <p className="mb-3 mt-0.5 text-[11px] leading-snug text-gray-400">
        {subtitle}
      </p>
      <form action={action} className="space-y-2">
        <input type="hidden" name="type" value={type} />
        <label className="block">
          <span className="mb-1 block text-xs text-gray-500">{labelAmount} ({currency})</span>
          <input
            name="amount"
            type="number"
            min={1}
            required
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-lg font-semibold"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-gray-500">{labelNote}</span>
          <input
            name="note"
            type="text"
            placeholder={notePlaceholder}
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>

        {amt > 0 && (
          <div className={`rounded-lg px-3 py-2 text-xs ${after < 0 ? "bg-red-50 text-red-700" : "bg-gray-50 text-gray-600"}`}>
            {standingLabel}{" "}
            <span className="font-bold tabular-nums">{formatMoney(after, currency)}</span>
            {after < 0 && (
              <span className="mt-0.5 block font-medium">
                {overLabel}
              </span>
            )}
          </div>
        )}

        <button
          type="submit"
          className={`w-full rounded-xl py-2.5 font-semibold text-white active:scale-95 transition ${
            isCollect ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"
          }`}
        >
          {submitLabel}
        </button>
      </form>
    </div>
  );
}
