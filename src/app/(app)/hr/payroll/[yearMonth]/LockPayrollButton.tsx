"use client";

import { useTransition } from "react";

export default function LockPayrollButton({
  yearMonth,
  action,
  label,
  confirmMessage,
}: {
  yearMonth: string;
  action: (fd: FormData) => Promise<void>;
  label: string;
  confirmMessage: string;
}) {
  const [pending, start] = useTransition();

  function handleClick() {
    if (!confirm(confirmMessage)) return;
    const fd = new FormData();
    fd.append("yearMonth", yearMonth);
    start(() => action(fd));
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
    >
      {pending ? "…" : label}
    </button>
  );
}
