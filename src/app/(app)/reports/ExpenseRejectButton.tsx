"use client";

import { useState } from "react";

export default function ExpenseRejectButton({
  expenseId,
  action,
  label,
  reasonPlaceholder,
  cancelLabel,
  confirmLabel,
}: {
  expenseId: string;
  action: (fd: FormData) => Promise<void>;
  label: string;
  reasonPlaceholder: string;
  cancelLabel: string;
  confirmLabel: string;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl border-2 border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 active:scale-95 transition"
      >
        {label}
      </button>
    );
  }

  return (
    <form action={action} className="w-full space-y-1.5 sm:w-64">
      <input type="hidden" name="expenseId" value={expenseId} />
      <textarea
        name="reason"
        rows={2}
        placeholder={reasonPlaceholder}
        className="w-full rounded-lg border border-red-200 px-2 py-1.5 text-xs"
      />
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex-1 rounded-lg bg-gray-100 px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200"
        >
          {cancelLabel}
        </button>
        <button
          type="submit"
          className="flex-1 rounded-lg bg-red-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
        >
          {confirmLabel}
        </button>
      </div>
    </form>
  );
}
