"use client";

import { useState } from "react";

export interface PickerItem {
  id: string;
  name: string;
  meta?: string;
}

export interface PickerCategory {
  id: string;
  name: string;
  items: PickerItem[];
}

export default function CategoryItemSelect({
  categories,
  name = "stockItemId",
  categoryPlaceholder = "— Select category —",
  itemPlaceholder = "— Select item —",
  required = true,
  className = "",
  selectClassName = "rounded-lg border border-gray-300 px-3 py-2",
}: {
  categories: PickerCategory[];
  name?: string;
  categoryPlaceholder?: string;
  itemPlaceholder?: string;
  required?: boolean;
  className?: string;
  selectClassName?: string;
}) {
  const [categoryId, setCategoryId] = useState("");
  const items = categories.find((c) => c.id === categoryId)?.items ?? [];

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <select
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        required={required}
        className={selectClassName}
      >
        <option value="">{categoryPlaceholder}</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <select
        key={categoryId}
        name={name}
        required={required}
        disabled={!categoryId}
        defaultValue=""
        className={`${selectClassName} disabled:bg-gray-50 disabled:text-gray-400`}
      >
        <option value="">{itemPlaceholder}</option>
        {items.map((i) => (
          <option key={i.id} value={i.id}>{i.name}{i.meta ? ` (${i.meta})` : ""}</option>
        ))}
      </select>
    </div>
  );
}
