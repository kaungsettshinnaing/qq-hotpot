"use client";

import { useState } from "react";
import { submitCashierSide } from "../actions";

const UNIT_LABEL: Record<string, string> = {
  UNIT: "Unit", GRAM: "g", KG: "kg", LITRE: "L", BOX: "Box", BOTTLE: "Btl", PACK: "Pack",
};

interface StockItem {
  id: string;
  name: string;
  unit: string;
  categoryId: string | null;
  categoryName: string | null;
}

interface ExistingItem {
  stockItemId: string | null;
  orderedQty: number | null;
  cashierQty: number | null;
  unitCost: number | null;
}

interface Category {
  id: string;
  name: string;
}

interface ExpenseCategory {
  id: string;
  name: string;
}

export interface StockInvoiceLabels {
  expenseCategory: string;
  selectPlaceholder: string;
  paymentMethod: string;
  cash: string;
  bank: string;
  description: string;
  descriptionPlaceholder: string;
  filterByCategory: string;
  allItems: string;
  clear: string;
  lineItemsHeading: string;
  colItem: string;
  colOrderedQty: string;
  colThisBatch: string;
  unitCostMmk: string;
  leaveBlankHint: string;
  submitInvoice: string;
}

export default function StockInvoiceForm({
  deliveryId,
  stockItems,
  categories,
  expenseCategories,
  existingItems,
  labels,
}: {
  deliveryId: string;
  stockItems: StockItem[];
  categories: Category[];
  expenseCategories: ExpenseCategory[];
  existingItems: ExistingItem[];
  labels: StockInvoiceLabels;
}) {
  const [selectedCategoryId, setSelectedCategoryId] = useState("");

  const filtered = selectedCategoryId
    ? stockItems.filter((i) => i.categoryId === selectedCategoryId)
    : stockItems;

  return (
    <form action={submitCashierSide} className="space-y-5 text-sm">
      <input type="hidden" name="deliveryId" value={deliveryId} />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">{labels.expenseCategory}</label>
          <select name="categoryId" required className="w-full rounded-lg border border-gray-300 px-3 py-2">
            <option value="">{labels.selectPlaceholder}</option>
            {expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">{labels.paymentMethod}</label>
          <div className="flex gap-4 pt-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="paymentSource" value="CASH_DRAWER" defaultChecked /> {labels.cash}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="paymentSource" value="BANK_TRANSFER" /> {labels.bank}
            </label>
          </div>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">{labels.description}</label>
        <input name="description" placeholder={labels.descriptionPlaceholder} maxLength={300}
          className="w-full rounded-lg border border-gray-300 px-3 py-2" />
      </div>

      {/* Category filter */}
      {categories.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-600">{labels.filterByCategory}:</label>
          <select
            value={selectedCategoryId}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value="">{labels.allItems}</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {selectedCategoryId && (
            <button type="button" onClick={() => setSelectedCategoryId("")}
              className="text-xs text-gray-400 hover:text-gray-600">
              ✕ {labels.clear}
            </button>
          )}
        </div>
      )}

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">{labels.lineItemsHeading}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-500">
                <th className="pb-2 text-left font-medium">{labels.colItem}</th>
                <th className="pb-2 text-center font-medium">{labels.colOrderedQty}</th>
                <th className="pb-2 text-center font-medium">{labels.colThisBatch}</th>
                <th className="pb-2 text-right font-medium">{labels.unitCostMmk}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((item) => {
                const existing = existingItems.find((e) => e.stockItemId === item.id);
                return (
                  <tr key={item.id}>
                    <td className="py-2">
                      <input type="hidden" name="itemId" value={item.id} />
                      <span className="text-gray-700">{item.name}</span>
                      <span className="ml-1 text-xs text-gray-400">({UNIT_LABEL[item.unit] ?? item.unit})</span>
                      {item.categoryName && (
                        <span className="ml-1 text-[10px] text-gray-300">{item.categoryName}</span>
                      )}
                    </td>
                    <td className="py-2 text-center">
                      <input name="orderedQty" type="number" min="0" step="any" placeholder="—"
                        defaultValue={existing?.orderedQty ?? ""}
                        className="w-20 rounded border border-gray-200 px-2 py-1 text-center text-sm" />
                    </td>
                    <td className="py-2 text-center">
                      <input name="cashierQty" type="number" min="0" step="any" placeholder="0"
                        defaultValue={existing?.cashierQty ?? ""}
                        className="w-20 rounded border border-gray-200 px-2 py-1 text-center text-sm" />
                    </td>
                    <td className="py-2 text-right">
                      <input name="unitCost" type="number" min="0" placeholder="0"
                        defaultValue={existing?.unitCost ?? ""}
                        className="w-24 rounded border border-gray-200 px-2 py-1 text-right text-sm" />
                    </td>
                  </tr>
                );
              })}
              {/* Keep hidden inputs for filtered-out items so all items submit */}
              {stockItems
                .filter((i) => selectedCategoryId && i.categoryId !== selectedCategoryId)
                .map((item) => {
                  const existing = existingItems.find((e) => e.stockItemId === item.id);
                  return (
                    <tr key={`hidden-${item.id}`} style={{ display: "none" }}>
                      <td>
                        <input type="hidden" name="itemId" value={item.id} />
                        <input type="hidden" name="orderedQty" value={existing?.orderedQty ?? ""} />
                        <input type="hidden" name="cashierQty" value={existing?.cashierQty ?? ""} />
                        <input type="hidden" name="unitCost" value={existing?.unitCost ?? ""} />
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-gray-400">{labels.leaveBlankHint}</p>
      </div>

      <button type="submit"
        className="w-full rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
        {labels.submitInvoice}
      </button>
    </form>
  );
}
