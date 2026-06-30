"use client";

import { useState } from "react";
import { createStockIn } from "./actions";
import SubmitButton from "@/components/SubmitButton";

interface StockItem {
  id: string;
  name: string;
  unit: string;
  categoryId: string | null;
}

interface StockCategory {
  id: string;
  name: string;
}

const UNIT_LABEL: Record<string, string> = {
  UNIT: "Unit", GRAM: "g", KG: "kg", LITRE: "L", BOX: "Box", BOTTLE: "Btl", PACK: "Pack",
};

interface Row {
  key: string;
  categoryId: string;
  itemId: string;
  unit: string;
  qty: string;
}

function newRow(): Row {
  return { key: Math.random().toString(36).slice(2), categoryId: "", itemId: "", unit: "", qty: "" };
}

export default function StockInForm({
  categories,
  items,
}: {
  categories: StockCategory[];
  items: StockItem[];
}) {
  const [rows, setRows] = useState<Row[]>([newRow()]);

  function handleCategoryChange(key: string, catId: string) {
    setRows((prev) => prev.map((r) =>
      r.key === key ? { ...r, categoryId: catId, itemId: "", unit: "" } : r
    ));
  }

  function handleItemChange(key: string, itemId: string) {
    const item = items.find((i) => i.id === itemId);
    setRows((prev) => prev.map((r) =>
      r.key === key ? { ...r, itemId, unit: UNIT_LABEL[item?.unit ?? ""] ?? item?.unit ?? "" } : r
    ));
  }

  function updateRow(key: string, field: keyof Omit<Row, "key">, value: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, newRow()]);
  }

  function removeRow(key: string) {
    if (rows.length > 1) setRows((prev) => prev.filter((r) => r.key !== key));
  }

  const nowStr = new Date().toLocaleString([], {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <form action={createStockIn} className="space-y-5 text-sm">
      {/* Date — fixed to now */}
      <div className="flex items-center gap-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-500">
        <span className="font-medium">Date received:</span> {nowStr}
      </div>

      {/* Line items */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Items Received</h3>
          <button type="button" onClick={addRow} className="text-xs font-medium text-brand hover:underline">
            + Add Item
          </button>
        </div>

        <div className="space-y-3">
          {rows.map((row, i) => {
            const catItems = items.filter((it) => it.categoryId === row.categoryId);
            return (
              <div key={row.key} className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500">Item {i + 1}</span>
                  {rows.length > 1 && (
                    <button type="button" onClick={() => removeRow(row.key)}
                      className="text-xs text-red-400 hover:text-red-600">
                      Remove
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {/* Category */}
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-gray-400">Category *</label>
                    <select
                      name="categoryId"
                      value={row.categoryId}
                      onChange={(e) => handleCategoryChange(row.key, e.target.value)}
                      required
                      className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm"
                    >
                      <option value="">— Select —</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Item */}
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-gray-400">Item *</label>
                    <select
                      name="itemId"
                      value={row.itemId}
                      onChange={(e) => handleItemChange(row.key, e.target.value)}
                      required
                      disabled={!row.categoryId}
                      className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm disabled:bg-gray-100 disabled:text-gray-400"
                    >
                      <option value="">{row.categoryId ? "— Select item —" : "Select category first"}</option>
                      {catItems.map((it) => (
                        <option key={it.id} value={it.id}>{it.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Unit (auto-filled, display only) */}
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-gray-400">Unit</label>
                    <input
                      name="unit"
                      value={row.unit}
                      onChange={(e) => updateRow(row.key, "unit", e.target.value)}
                      placeholder="kg / box"
                      className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm"
                    />
                  </div>

                  {/* Measurement (qty) */}
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-gray-400">Measurement *</label>
                    <input
                      name="qty"
                      value={row.qty}
                      onChange={(e) => updateRow(row.key, "qty", e.target.value)}
                      type="number"
                      min="0.01"
                      step="any"
                      required
                      placeholder="0"
                      className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <SubmitButton className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
        Record Stock-In
      </SubmitButton>
    </form>
  );
}
