"use client";

import { useTransition } from "react";
import { deleteFlavour } from "../actions";

export default function DeleteFlavourButton({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const [pending, start] = useTransition();

  function handleClick() {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    const fd = new FormData();
    fd.append("id", id);
    start(() => deleteFlavour(fd));
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className="ml-1 text-xs text-red-500 hover:underline disabled:opacity-50"
    >
      {pending ? "…" : "Delete"}
    </button>
  );
}
