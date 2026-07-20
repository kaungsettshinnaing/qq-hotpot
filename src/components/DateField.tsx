"use client";

import { useState } from "react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function isoToDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return "";
  const [, y, mo, d] = m;
  return `${d} ${MONTHS[parseInt(mo) - 1]} ${y}`;
}

/** Native date picker for selection, formatted as "DD MMM YYYY" once a date is chosen. */
export default function DateField({
  name,
  label,
  required,
  defaultValue,
  placeholder = "Select date",
  min,
  max,
}: {
  name: string;
  label?: string;
  required?: boolean;
  defaultValue?: string; // ISO yyyy-mm-dd
  placeholder?: string;
  min?: string;
  max?: string;
}) {
  const [iso, setIso] = useState(defaultValue ?? "");

  return (
    <div>
      {label && <label className="label">{label}</label>}
      <div className="relative">
        <div className={`input flex items-center ${iso ? "text-gray-900" : "text-gray-400"}`}>
          {iso ? isoToDisplay(iso) : placeholder}
        </div>
        <input
          type="date"
          name={name}
          required={required}
          defaultValue={defaultValue}
          min={min}
          max={max}
          onChange={(e) => setIso(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
    </div>
  );
}
