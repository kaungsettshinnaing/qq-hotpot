"use client";

import { useState } from "react";
import { submitNonStockCashierSide } from "../actions";

interface ExpenseCategory {
  id: string;
  name: string;
}

interface Row {
  key: string;
  description: string;
  qty: string;
  unitLabel: string;
  unitCost: string;
}

function newRow(): Row {
  return { key: Math.random().toString(36).slice(2), description: "", qty: "", unitLabel: "", unitCost: "" };
}

export default function NonStockInvoiceForm({
  deliveryId,
  expenseCategories,
}: {
  deliveryId: string;
  expenseCategories: ExpenseCategory[];
}) {
  const [rows, setRows] = useState<Row[]>([newRow()]);

  function addRow() {
    setRows((r) => [...r, newRow()]);
  }

  function removeRow(key: string) {
    setRows((r) => (r.length > 1 ? r.filter((row) => row.key !== key) : r));
  }

  function update(key: string, field: keyof Omit<Row, "key">, value: string) {
    setRows((r) => r.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
  }

  const total = rows.reduce((sum, row) => {
    const qty = parseFloat(row.qty) || 0;
    const cost = parseInt(row.unitCost) || 0;
    return sum + qty * cost;
  }, 0);

  return (
    <form action={submitNonStockCashierSide} className="space-y-5 text-sm">
      <input type="hidden" name="deliveryId" value={deliveryId} />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Expense Category</label>
          <select name="categoryId" required className="w-full rounded-lg border border-gray-300 px-3 py-2">
            <option value="">— Select —</option>
            {expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Payment Method</label>
          <div className="flex gap-4 pt-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="paymentSource" value="CASH_DRAWER" defaultChecked /> Cash
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="paymentSource" value="BANK_TRANSFER" /> Bank
            </label>
          </div>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Description</label>
        <input name="description" placeholder="e.g. Office supplies" maxLength={300}
          className="w-full rounded-lg border border-gray-300 px-3 py-2" />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Invoice Line Items</h3>
          <button type="button" onClick={addRow}
            className="text-xs font-medium text-brand hover:underline">
            + Add Line
          </button>
        </div>

        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={row.key} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-4">
                {i === 0 && <div className="mb-1 text-[10px] font-medium text-gray-400">Description *</div>}
                <input
                  name="lineDesc"
                  value={row.description}
                  onChange={(e) => update(row.key, "description", e.target.value)}
                  placeholder="Item name"
                  required
                  className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm"
                />
              </div>
              <div className="col-span-2">
                {i === 0 && <div className="mb-1 text-[10px] font-medium text-gray-400">Qty *</div>}
                <input
                  name="lineQty"
                  value={row.qty}
                  onChange={(e) => update(row.key, "qty", e.target.value)}
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0"
                  required
                  className="w-full rounded border border-gray-200 px-2 py-1.5 text-center text-sm"
                />
              </div>
              <div className="col-span-2">
                {i === 0 && <div className="mb-1 text-[10px] font-medium text-gray-400">Unit</div>}
                <input
                  name="lineUnit"
                  value={row.unitLabel}
                  onChange={(e) => update(row.key, "unitLabel", e.target.value)}
                  placeholder="kg / box"
                  className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm"
                />
              </div>
              <div className="col-span-3">
                {i === 0 && <div className="mb-1 text-[10px] font-medium text-gray-400">Unit Cost (MMK)</div>}
                <input
                  name="lineUnitCost"
                  value={row.unitCost}
                  onChange={(e) => update(row.key, "unitCost", e.target.value)}
                  type="number"
                  min="0"
                  placeholder="0"
                  className="w-full rounded border border-gray-200 px-2 py-1.5 text-right text-sm"
                />
              </div>
              <div className="col-span-1 flex justify-center pb-0.5">
                {i === 0 && <div className="mb-1 text-[10px] text-gray-400">&nbsp;</div>}
                <button
                  type="button"
                  onClick={() => removeRow(row.key)}
                  disabled={rows.length === 1}
                  className="text-red-400 hover:text-red-600 disabled:text-gray-200 text-lg leading-none"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>

        {total > 0 && (
          <div className="mt-3 text-right text-sm font-bold text-gray-700">
            Total: {Math.round(total).toLocaleString()} MMK
          </div>
        )}
      </div>

      <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-700">
        Non-stock invoices are cashier-only — no counter count required. Submitted immediately as complete.
      </div>

      <button type="submit"
        className="w-full rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
        Submit Invoice
      </button>
    </form>
  );
}
