"use client";

import { useTransition } from "react";
import { deleteEmployee } from "../actions";

export default function DeleteEmployeeButton({
  userId,
  labels,
}: {
  userId: string;
  labels: { confirmMessage: string; delete: string; deleting: string };
}) {
  const [pending, start] = useTransition();

  function handleClick() {
    if (!confirm(labels.confirmMessage)) return;
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
      {pending ? labels.deleting : labels.delete}
    </button>
  );
}
