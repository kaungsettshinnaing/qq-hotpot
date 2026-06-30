"use client";

import { useState, useTransition } from "react";
import { addExpense } from "../actions";

interface Category {
  id: string;
  name: string;
  isStock: boolean;
  items: { id: string; name: string; defaultUnit: string | null }[];
}

interface LineRow {
  key: string;
  description: string;
  unit: string;
  qty: string;
  price: string;
}

function newRow(): LineRow {
  return { key: Math.random().toString(36).slice(2), description: "", unit: "", qty: "1", price: "" };
}

export default function ExpenseForm({
  allCategories,
  stockCategories,
  currency,
}: {
  allCategories: { id: string; name: string }[];
  stockCategories: Category[];
  currency: string;
}) {
  const [invoiceType, setInvoiceType] = useState<"NON_STOCK" | "STOCK">("NON_STOCK");
  const [categoryId, setCategoryId] = useState("");
  const [rows, setRows] = useState<LineRow[]>([newRow()]);
  const [pending, start] = useTransition();

  const shownCategories = invoiceType === "STOCK"
    ? stockCategories
    : allCategories;

  const selectedStockCat = invoiceType === "STOCK"
    ? stockCategories.find((c) => c.id === categoryId)
    : null;

  const items = selectedStockCat?.items ?? [];

  function handleCategoryChange(id: string) {
    setCategoryId(id);
    // Reset all rows' description + unit when category changes
    setRows((prev) => prev.map((r) => ({ ...r, description: "", unit: "" })));
  }

  function handleItemSelect(rowKey: string, itemName: string) {
    const item = items.find((i) => i.name === itemName);
    setRows((prev) => prev.map((r) =>
      r.key === rowKey
        ? { ...r, description: itemName, unit: item?.defaultUnit ?? "" }
        : r
    ));
  }

  function handleInvoiceTypeChange(type: "NON_STOCK" | "STOCK") {
    setInvoiceType(type);
    setCategoryId("");
    setRows([newRow()]);
  }

  function updateRow(key: string, field: keyof Omit<LineRow, "key">, value: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, newRow()]);
  }

  function removeRow(key: string) {
    if (rows.length > 1) setRows((prev) => prev.filter((r) => r.key !== key));
  }

  const total = rows.reduce((sum, r) => sum + (parseInt(r.price) || 0), 0);

  const nowStr = new Date().toLocaleString([], {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => { await addExpense(fd); });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-sm">
      {/* Invoice type toggle */}
      <div>
        <span className="mb-1.5 block text-xs font-medium text-gray-600">Invoice type</span>
        <div className="flex gap-2">
          {(["NON_STOCK", "STOCK"] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => handleInvoiceTypeChange(type)}
              className={
                "flex-1 rounded-lg border py-2 text-sm font-semibold transition " +
                (invoiceType === type
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-gray-200 text-gray-500 hover:border-gray-300")
              }
            >
              {type === "STOCK" ? "Stock Invoice" : "Non-Stock Invoice"}
            </button>
          ))}
        </div>
      </div>

      {/* Hidden invoice type for form submission */}
      <input type="hidden" name="invoiceType" value={invoiceType} />

      {/* Category */}
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">
          Category {invoiceType === "STOCK" && <span className="text-gray-400">(stock categories only)</span>}
        </label>
        <select
          name="categoryId"
          required
          value={categoryId}
          onChange={(e) => handleCategoryChange(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2"
        >
          <option value="">— Select category —</option>
          {shownCategories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Payment source */}
      <div>
        <span className="mb-1 block text-xs font-medium text-gray-600">Paid from</span>
        <div className="flex gap-4">
          <label className="flex items-center gap-1.5">
            <input type="radio" name="paymentSource" value="CASH_DRAWER" defaultChecked /> Cash drawer
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="paymentSource" value="BANK_TRANSFER" /> Bank transfer
          </label>
        </div>
        <p className="mt-1 text-[11px] text-gray-400">Bank transfer goes to AP — does not affect drawer cash.</p>
      </div>

      {/* Date (read-only) */}
      <div className="flex items-center gap-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-500">
        <span className="font-medium">Date:</span> {nowStr}
      </div>

      {/* Line items */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
            Line Items (breakdown)
          </h3>
          <button type="button" onClick={addRow} className="text-xs font-medium text-brand hover:underline">
            + Add Line
          </button>
        </div>

        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={row.key} className="grid grid-cols-12 gap-1.5 items-end">
              {/* Description */}
              <div className={invoiceType === "STOCK" ? "col-span-5" : "col-span-5"}>
                {i === 0 && <div className="mb-1 text-[10px] font-medium text-gray-400">Description *</div>}
                {invoiceType === "STOCK" && categoryId ? (
                  <select
                    name="lineDesc"
                    value={row.description}
                    onChange={(e) => handleItemSelect(row.key, e.target.value)}
                    required
                    className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm"
                  >
                    <option value="">— Select item —</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.name}>{item.name}</option>
                    ))}
                  </select>
                ) : invoiceType === "STOCK" && !categoryId ? (
                  <input
                    name="lineDesc"
                    value=""
                    readOnly
                    placeholder="Select category first"
                    className="w-full rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm text-gray-400"
                  />
                ) : (
                  <input
                    name="lineDesc"
                    value={row.description}
                    onChange={(e) => updateRow(row.key, "description", e.target.value)}
                    placeholder="Item name"
                    required
                    className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm"
                  />
                )}
              </div>

              {/* Unit */}
              <div className="col-span-2">
                {i === 0 && <div className="mb-1 text-[10px] font-medium text-gray-400">Unit</div>}
                <input
                  name="lineUnit"
                  value={row.unit}
                  onChange={(e) => updateRow(row.key, "unit", e.target.value)}
                  placeholder="kg/box"
                  className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm"
                />
              </div>

              {/* Qty */}
              <div className="col-span-2">
                {i === 0 && <div className="mb-1 text-[10px] font-medium text-gray-400">Measurement</div>}
                <input
                  name="lineQty"
                  value={row.qty}
                  onChange={(e) => updateRow(row.key, "qty", e.target.value)}
                  type="number"
                  min="0"
                  step="any"
                  placeholder="1"
                  required
                  className="w-full rounded border border-gray-200 px-2 py-1.5 text-center text-sm"
                />
              </div>

              {/* Price (total for this line) */}
              <div className="col-span-2">
                {i === 0 && <div className="mb-1 text-[10px] font-medium text-gray-400">Price ({currency})</div>}
                <input
                  name="linePrice"
                  value={row.price}
                  onChange={(e) => updateRow(row.key, "price", e.target.value)}
                  type="number"
                  min="0"
                  placeholder="0"
                  required
                  className="w-full rounded border border-gray-200 px-2 py-1.5 text-right text-sm"
                />
              </div>

              {/* Remove */}
              <div className="col-span-1 flex justify-center">
                {i === 0 && <div className="mb-1 text-[10px] text-gray-400">&nbsp;</div>}
                <button
                  type="button"
                  onClick={() => removeRow(row.key)}
                  disabled={rows.length === 1}
                  className="pb-0.5 text-lg leading-none text-red-400 hover:text-red-600 disabled:text-gray-200"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Total */}
        <div className={
          "mt-3 rounded-lg p-3 flex items-center justify-between " +
          (total > 0 ? "bg-brand/5 border border-brand/20" : "bg-gray-50")
        }>
          <span className="text-xs font-medium text-gray-600">Total</span>
          <span className={`text-base font-bold tabular-nums ${total > 0 ? "text-brand-dark" : "text-gray-400"}`}>
            {total.toLocaleString()} {currency}
          </span>
        </div>
      </div>

      {/* Receipt upload */}
      <div>
        <span className="mb-1 block text-xs font-medium text-gray-600">Receipts (optional)</span>
        <input
          name="receipts"
          type="file"
          multiple
          accept="image/*,application/pdf"
          className="w-full rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 file:mr-3 file:rounded file:border-0 file:bg-brand/10 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-brand"
        />
      </div>

      <button
        type="submit"
        disabled={pending || total === 0 || !categoryId}
        className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white hover:bg-brand-dark active:scale-95 transition disabled:opacity-60"
      >
        {pending ? "Saving…" : `Add Expense — ${total.toLocaleString()} ${currency}`}
      </button>
    </form>
  );
}
