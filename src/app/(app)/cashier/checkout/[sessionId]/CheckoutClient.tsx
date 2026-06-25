"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyDiscount, removeDiscount, addPayment } from "../../actions";
import type { ActionResult } from "@/lib/action-result";

type Method = "CASH" | "KBZPAY" | "OTHER";

export default function CheckoutClient(props: {
  sessionId: string;
  currency: string;
  balance: number;
  hasOpenShift: boolean;
  discount: { type: "PERCENT" | "FIXED"; value: number; reason: string | null } | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "err" | "ok"; text: string } | null>(null);

  const [dtype, setDtype] = useState<"PERCENT" | "FIXED">(props.discount?.type ?? "FIXED");
  const [dval, setDval] = useState<number>(props.discount?.value ?? 0);
  const [dreason, setDreason] = useState<string>(props.discount?.reason ?? "");

  const [method, setMethod] = useState<Method>("CASH");
  const [amount, setAmount] = useState<number>(Math.max(0, props.balance));
  const [reference, setReference] = useState("");

  function run(p: Promise<ActionResult>, onOk?: () => void) {
    setMsg(null);
    start(async () => {
      const r = await p;
      if (!r.ok) setMsg({ kind: "err", text: r.error });
      else {
        onOk?.();
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      {msg && (
        <p
          className={
            "rounded-lg px-3 py-2 text-sm " +
            (msg.kind === "err" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700")
          }
        >
          {msg.text}
        </p>
      )}

      {/* Discount */}
      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">Discount</h3>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-gray-500">Type</span>
            <select
              value={dtype}
              onChange={(e) => setDtype(e.target.value as "PERCENT" | "FIXED")}
              className="rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="FIXED">Fixed ({props.currency})</option>
              <option value="PERCENT">Percent (%)</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-gray-500">Value</span>
            <input
              type="number"
              min={0}
              value={dval}
              onChange={(e) => setDval(parseInt(e.target.value || "0", 10))}
              className="w-28 rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="block flex-1">
            <span className="mb-1 block text-xs text-gray-500">Reason (optional)</span>
            <input
              value={dreason}
              onChange={(e) => setDreason(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
              placeholder="e.g. regular customer"
            />
          </label>
          <button
            onClick={() => run(applyDiscount(props.sessionId, dtype, dval, dreason))}
            disabled={pending}
            className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-60"
          >
            Apply
          </button>
          {props.discount && (
            <button
              onClick={() => run(removeDiscount(props.sessionId))}
              disabled={pending}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
            >
              Remove
            </button>
          )}
        </div>
      </section>

      {/* Payment */}
      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">Take payment</h3>
        {!props.hasOpenShift && (
          <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Open a shift first to record payments.
          </p>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-gray-500">Method</span>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as Method)}
              className="rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="CASH">Cash</option>
              <option value="KBZPAY">KBZPay</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-gray-500">Amount</span>
            <input
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(parseInt(e.target.value || "0", 10))}
              className="w-32 rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>
          <button
            type="button"
            onClick={() => setAmount(Math.max(0, props.balance))}
            className="rounded-lg border border-gray-300 px-3 py-2 text-xs hover:bg-gray-50"
          >
            Exact ({props.balance.toLocaleString()})
          </button>
          {method !== "CASH" && (
            <label className="block flex-1">
              <span className="mb-1 block text-xs text-gray-500">Reference</span>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                placeholder="txn id / note"
              />
            </label>
          )}
          <button
            onClick={() =>
              run(addPayment(props.sessionId, method, amount, reference), () => setReference(""))
            }
            disabled={pending || !props.hasOpenShift}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
          >
            Add payment
          </button>
        </div>
      </section>
    </div>
  );
}
