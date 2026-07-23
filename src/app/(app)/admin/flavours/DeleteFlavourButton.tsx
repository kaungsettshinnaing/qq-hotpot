"use client";

import { useTransition } from "react";
import { deleteFlavour } from "../actions";

export default function DeleteFlavourButton({
  id,
  name,
  labels,
}: {
  id: string;
  name: string;
  labels: { delete: string; confirm: string };
}) {
  const [pending, start] = useTransition();

  function handleClick() {
    if (!confirm(labels.confirm)) return;
    const fd = new FormData();
    fd.append("id", id);
    start(async () => {
      const result = await deleteFlavour(fd);
      if (!result.ok) alert(result.error);
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className="ml-1 text-xs text-red-500 hover:underline disabled:opacity-50"
    >
      {pending ? "…" : labels.delete}
    </button>
  );
}
