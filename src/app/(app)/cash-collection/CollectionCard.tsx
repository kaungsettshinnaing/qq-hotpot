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
}: {
  type: "COLLECT" | "INJECT";
  standing: number;
  currency: string;
  action: (fd: FormData) => Promise<void>;
  title?: string;
  subtitle?: string;
  notePlaceholder?: string;
  submitLabel?: string;
  standingLabel?: string;
  overLabel?: string;
}) {
  const [amount, setAmount] = useState("");
  const isCollect = type === "COLLECT";
  const amt = Math.max(0, Math.round(Number(amount) || 0));
  const after = isCollect ? standing - amt : standing + amt;

  const defaultTitle = isCollect ? "Collect cash from drawer" : "Inject cash into drawer";
  const defaultSubtitle = isCollect
    ? "Only for cash you are physically taking OUT of the drawer right now."
    : "Only for cash you are physically putting INTO the drawer right now.";
  const defaultNotePlaceholder = isCollect ? "e.g. Daily banking run" : "e.g. Float top-up";
  const defaultSubmitLabel = isCollect ? "↓ Collect — deduct from standing" : "↑ Inject — add to standing";

  return (
    <div className={`rounded-xl border-2 bg-white p-4 shadow-sm ${isCollect ? "border-red-200" : "border-green-200"}`}>
      <h3 className={`text-sm font-semibold ${isCollect ? "text-red-700" : "text-green-700"}`}>
        {title ?? defaultTitle}
      </h3>
      <p className="mb-3 mt-0.5 text-[11px] leading-snug text-gray-400">
        {subtitle ?? defaultSubtitle}
      </p>
      <form action={action} className="space-y-2">
        <input type="hidden" name="type" value={type} />
        <label className="block">
          <span className="mb-1 block text-xs text-gray-500">Amount ({currency})</span>
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
          <span className="mb-1 block text-xs text-gray-500">Note (optional)</span>
          <input
            name="note"
            type="text"
            placeholder={notePlaceholder ?? defaultNotePlaceholder}
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>

        {amt > 0 && (
          <div className={`rounded-lg px-3 py-2 text-xs ${after < 0 ? "bg-red-50 text-red-700" : "bg-gray-50 text-gray-600"}`}>
            {standingLabel ?? "Standing after this entry:"}{" "}
            <span className="font-bold tabular-nums">{formatMoney(after, currency)}</span>
            {after < 0 && (
              <span className="mt-0.5 block font-medium">
                {overLabel ?? "That is more than the drawer holds — check the amount."}
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
          {submitLabel ?? defaultSubmitLabel}
        </button>
      </form>
    </div>
  );
}
