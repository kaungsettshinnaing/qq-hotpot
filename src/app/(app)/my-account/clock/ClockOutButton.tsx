"use client";

import { useState, useRef } from "react";
import { clockOut } from "./actions";

interface Props {
  labelClockOut: string;
  labelConfirm: string;
  labelCancel: string;
  labelYes: string;
}

export default function ClockOutButton({ labelClockOut, labelConfirm, labelCancel, labelYes }: Props) {
  const [confirming, setConfirming] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="w-full rounded-2xl bg-red-700 py-4 text-lg font-bold text-white hover:bg-red-800 active:scale-95 transition"
      >
        {labelClockOut}
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-center text-sm font-semibold text-red-700">{labelConfirm}</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-2xl border border-gray-300 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 active:scale-95 transition"
        >
          {labelCancel}
        </button>
        <form ref={formRef} action={clockOut}>
          <button
            type="submit"
            className="w-full rounded-2xl bg-red-700 py-3 text-sm font-bold text-white hover:bg-red-800 active:scale-95 transition"
          >
            {labelYes}
          </button>
        </form>
      </div>
    </div>
  );
}
