"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format";

export default function CountedCashInput({
  expected,
  currency,
  label,
  matchLabel,
  discrepancyWarning,
}: {
  expected: number;
  currency: string;
  label: string;
  matchLabel: string;
  discrepancyWarning: string;
}) {
  const [value, setValue] = useState("");
  const counted = value === "" ? null : Math.round(Number(value) || 0);
  const variance = counted === null ? 0 : counted - expected;

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="mb-1 block text-xs text-gray-500">{label} ({currency})</span>
        <input
          name="countedCash"
          type="number"
          min={0}
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-lg"
        />
      </label>
      <div className={`rounded-lg px-3 py-2 text-xs ${
        counted !== null && variance !== 0 ? "bg-amber-50 text-amber-700" : "bg-gray-50 text-gray-600"
      }`}>
        {matchLabel} <span className="font-bold tabular-nums">{formatMoney(expected, currency)}</span>
        {counted !== null && variance !== 0 && (
          <span className="mt-0.5 block font-medium">
            {formatMoney(Math.abs(variance), currency)} {discrepancyWarning}
          </span>
        )}
      </div>
    </div>
  );
}
