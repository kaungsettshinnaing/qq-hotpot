"use client";

import { useState } from "react";
import CategoryItemSelect, { PickerCategory } from "@/components/CategoryItemSelect";

export default function UsageItemQtyFields({
  categories,
  itemLabel,
  categoryPlaceholder,
  itemPlaceholder,
  qtyLabel,
  unitLabel,
}: {
  categories: PickerCategory[];
  itemLabel: string;
  categoryPlaceholder: string;
  itemPlaceholder: string;
  qtyLabel: string;
  unitLabel: string;
}) {
  const [unit, setUnit] = useState<string | undefined>(undefined);

  return (
    <>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">{itemLabel}</label>
        <CategoryItemSelect
          categories={categories}
          categoryPlaceholder={categoryPlaceholder}
          itemPlaceholder={itemPlaceholder}
          selectClassName="w-full rounded-lg border border-gray-300 px-3 py-2"
          className="flex-col"
          onItemChange={(item) => setUnit(item?.unit)}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">
          {qtyLabel}
          {unit ? <span className="ml-1 font-normal text-gray-400">({unitLabel}: {unit})</span> : null}
        </label>
        <input name="qty" type="number" min="1" required placeholder="0"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-lg font-semibold" />
      </div>
    </>
  );
}
