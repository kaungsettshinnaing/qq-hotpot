"use client";

import { useTransition } from "react";
import { deleteEmployee } from "../actions";

export default function DeleteEmployeeButton({ userId, name }: { userId: string; name: string }) {
  const [pending, start] = useTransition();

  function handleClick() {
    if (
      !confirm(
        `Permanently delete "${name}"?\n\nThis will remove all their attendance, leave, advances, fines, and payroll records. The login account will be deactivated.\n\nThis cannot be undone.`,
      )
    )
      return;
    const fd = new FormData();
    fd.append("userId", userId);
    start(() => deleteEmployee(fd));
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className="btn-outline text-red-600 disabled:opacity-50"
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
