"use client";

import { useState } from "react";
import CategoryItemSelect, { PickerCategory } from "@/components/CategoryItemSelect";

export default function AdjustmentItemQtyFields({
  categories,
  categoryPlaceholder,
  itemPlaceholder,
  qtyPlaceholder,
}: {
  categories: PickerCategory[];
  categoryPlaceholder: string;
  itemPlaceholder: string;
  qtyPlaceholder: string;
}) {
  const [unit, setUnit] = useState<string | undefined>(undefined);

  return (
    <>
      <CategoryItemSelect
        categories={categories}
        categoryPlaceholder={categoryPlaceholder}
        itemPlaceholder={itemPlaceholder}
        onItemChange={(item) => setUnit(item?.unit)}
      />
      <div className="flex items-center gap-2">
        <input name="qty" type="number" min="1" required placeholder={qtyPlaceholder}
          className="w-28 rounded-lg border border-gray-300 px-3 py-2" />
        {unit && <span className="text-xs text-gray-500">{unit}</span>}
      </div>
    </>
  );
}
