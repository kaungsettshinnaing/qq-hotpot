"use client";

import { useState, useTransition } from "react";
import { addExpense, addStockInvoice, recordStockPrepayment } from "../actions";

interface Category {
  id: string;
  name: string;
  isStock: boolean;
  items: { id: string; name: string; defaultUnit: string | null; stockItemId: string | null }[];
}

interface OutstandingDelivery {
  id: string;
  status: string;
  paymentStatus: string;
  label: string;
  supplierId: string;
}

interface Labels {
  supplier: string;
  noSupplier: string;
  invoiceNo: string;
  tagDelivery: string;
  tagNone: string;
  taggedNoPayment: string;
  unitCost: string;
  submitStockInvoice: string;
  stockInvoiceHint: string;
  prepaymentHeading: string;
  prepaymentToggle: string;
  prepaymentHint: string;
  amount: string;
  record: string;
  cancel: string;
}

type Mode = "NON_STOCK" | "STOCK" | "PREPAYMENT";

interface LineRow {
  key: string;
  stockItemId: string; // STOCK only
  description: string;
  unit: string;
  qty: string;
  price: string; // NON_STOCK: line total · STOCK: unit cost
}

function newRow(): LineRow {
  return { key: Math.random().toString(36).slice(2), stockItemId: "", description: "", unit: "", qty: "1", price: "" };
}

export default function ExpenseForm({
  allCategories,
  stockCategories,
  suppliers,
  outstandingDeliveries,
  currency,
  labels,
}: {
  allCategories: { id: string; name: string }[];
  stockCategories: Category[];
  suppliers: { id: string; name: string }[];
  outstandingDeliveries: OutstandingDelivery[];
  currency: string;
  labels: Labels;
}) {
  const [mode, setMode] = useState<Mode>("NON_STOCK");
  const [categoryId, setCategoryId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [taggedDeliveryId, setTaggedDeliveryId] = useState("");
  const [rows, setRows] = useState<LineRow[]>([newRow()]);
  const [pending, start] = useTransition();

  const isStock = mode === "STOCK";
  const shownCategories = isStock ? stockCategories : allCategories;
  const selectedStockCat = isStock ? stockCategories.find((c) => c.id === categoryId) : null;
  const items = selectedStockCat?.items ?? [];

  const taggedDelivery = outstandingDeliveries.find((d) => d.id === taggedDeliveryId);
  const taggedPrepaid = taggedDelivery?.paymentStatus === "PREPAID";

  function handleModeChange(next: Mode) {
    setMode(next);
    setCategoryId("");
    setSupplierId("");
    setTaggedDeliveryId("");
    setRows([newRow()]);
  }

  function handleCategoryChange(id: string) {
    setCategoryId(id);
    setRows((prev) => prev.map((r) => ({ ...r, stockItemId: "", description: "", unit: "" })));
  }

  function handleItemSelect(rowKey: string, stockCatItemId: string) {
    const item = items.find((i) => i.id === stockCatItemId);
    setRows((prev) => prev.map((r) =>
      r.key === rowKey
        ? { ...r, stockItemId: item?.stockItemId ?? "", description: item?.name ?? "", unit: item?.defaultUnit ?? "" }
        : r
    ));
  }

  function handleTagChange(id: string) {
    setTaggedDeliveryId(id);
    const d = outstandingDeliveries.find((x) => x.id === id);
    if (d?.supplierId) setSupplierId(d.supplierId);
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

  // STOCK: price field = unit cost → line total = qty × unitCost
  // NON_STOCK: price field = line total
  const total = rows.reduce((sum, r) => {
    const price = parseInt(r.price) || 0;
    if (isStock) return sum + Math.round((parseFloat(r.qty) || 0) * price);
    return sum + price;
  }, 0);

  const nowStr = new Date().toLocaleString([], {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      if (mode === "STOCK") await addStockInvoice(fd);
      else await addExpense(fd);
    });
  }

  function handlePrepaymentSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => { await recordStockPrepayment(fd); });
  }

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div>
        <span className="mb-1.5 block text-xs font-medium text-gray-600">Invoice type</span>
        <div className="flex gap-2">
          {(["NON_STOCK", "STOCK", "PREPAYMENT"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => handleModeChange(m)}
              className={
                "flex-1 rounded-lg border py-2 text-xs font-semibold transition " +
                (mode === m
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-gray-200 text-gray-500 hover:border-gray-300")
              }
            >
              {m === "STOCK" ? "Stock Invoice" : m === "NON_STOCK" ? "Non-Stock Invoice" : labels.prepaymentToggle}
            </button>
          ))}
        </div>
      </div>

      {mode === "PREPAYMENT" ? (
        <form onSubmit={handlePrepaymentSubmit} className="space-y-4 text-sm">
          <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3 text-xs text-yellow-800">
            {labels.prepaymentHint}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">{labels.supplier}</label>
            <select name="supplierId" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2">
              <option value="">— {labels.noSupplier} —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Category</label>
            <select name="categoryId" required value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2">
              <option value="">— Select category —</option>
              {stockCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">{labels.amount}</label>
            <input name="amount" type="number" min="1" required placeholder="0"
              className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </div>
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
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Description</label>
            <input name="description" maxLength={300} placeholder="e.g. Advance payment for beer order"
              className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </div>
          <button type="submit" disabled={pending || !categoryId}
            className="w-full rounded-lg bg-yellow-500 py-2.5 font-semibold text-white hover:bg-yellow-600 disabled:opacity-60">
            {pending ? "Saving…" : labels.record}
          </button>
        </form>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          <input type="hidden" name="invoiceType" value={mode} />

          {/* Category */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Category {isStock && <span className="text-gray-400">(stock categories only)</span>}
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

          {/* Stock-only header: supplier, invoice no, tag */}
          {isStock && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">{labels.supplier}</label>
                  <select name="supplierId" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2">
                    <option value="">— {labels.noSupplier} —</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">{labels.invoiceNo}</label>
                  <input name="invoiceNo" maxLength={100} placeholder="—"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2" />
                </div>
              </div>

              {outstandingDeliveries.length > 0 && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">{labels.tagDelivery}</label>
                  <select name="taggedDeliveryId" value={taggedDeliveryId}
                    onChange={(e) => handleTagChange(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2">
                    <option value="">— {labels.tagNone} —</option>
                    {outstandingDeliveries.map((d) => (
                      <option key={d.id} value={d.id}>{d.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

          {/* Payment source — hidden when tagged to a prepaid delivery (already paid) */}
          {isStock && taggedPrepaid ? (
            <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700">
              {labels.taggedNoPayment}
            </div>
          ) : (
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
          )}

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
              {rows.map((row) => (
                <div key={row.key} className="rounded-lg border border-gray-200 bg-gray-50 p-2 space-y-1.5">
                  {/* Description / item picker */}
                  {isStock && categoryId ? (
                    <>
                      <input type="hidden" name="stockItemId" value={row.stockItemId} />
                      <select
                        value={items.find((i) => i.stockItemId === row.stockItemId)?.id ?? ""}
                        onChange={(e) => handleItemSelect(row.key, e.target.value)}
                        required
                        className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm"
                      >
                        <option value="">— Select item —</option>
                        {items.map((item) => (
                          <option key={item.id} value={item.id}>{item.name}</option>
                        ))}
                      </select>
                    </>
                  ) : isStock && !categoryId ? (
                    <input
                      value=""
                      readOnly
                      placeholder="Select category first"
                      className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-400"
                    />
                  ) : (
                    <input
                      name="lineDesc"
                      value={row.description}
                      onChange={(e) => updateRow(row.key, "description", e.target.value)}
                      placeholder="Description *"
                      required
                      className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm"
                    />
                  )}

                  {/* Unit · Qty · Price/UnitCost · Remove */}
                  <div className="flex gap-1.5 items-center">
                    <input
                      name="lineUnit"
                      value={row.unit}
                      onChange={(e) => updateRow(row.key, "unit", e.target.value)}
                      placeholder="Unit"
                      className="w-20 rounded border border-gray-200 bg-white px-2 py-1.5 text-sm"
                    />
                    <input
                      name="lineQty"
                      value={row.qty}
                      onChange={(e) => updateRow(row.key, "qty", e.target.value)}
                      type="number"
                      min="0"
                      step="any"
                      placeholder="Qty"
                      required
                      className="w-16 rounded border border-gray-200 bg-white px-2 py-1.5 text-center text-sm"
                    />
                    <input
                      name={isStock ? "lineUnitCost" : "linePrice"}
                      value={row.price}
                      onChange={(e) => updateRow(row.key, "price", e.target.value)}
                      type="number"
                      min="0"
                      placeholder={isStock ? `${labels.unitCost} (${currency})` : `Price (${currency})`}
                      required
                      className="min-w-0 flex-1 rounded border border-gray-200 bg-white px-2 py-1.5 text-right text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => removeRow(row.key)}
                      disabled={rows.length === 1}
                      className="text-lg leading-none text-red-400 hover:text-red-600 disabled:text-gray-200"
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

          {isStock && (
            <p className="text-[11px] text-gray-400">{labels.stockInvoiceHint}</p>
          )}

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
            {pending ? "Saving…" : isStock
              ? `${labels.submitStockInvoice} — ${total.toLocaleString()} ${currency}`
              : `Add Expense — ${total.toLocaleString()} ${currency}`}
          </button>
        </form>
      )}
    </div>
  );
}
