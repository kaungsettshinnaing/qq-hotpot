"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyDiscount, removeDiscount, addPayment } from "../../actions";
import type { ActionResult } from "@/lib/action-result";

type Method = "CASH" | "KBZPAY" | "OTHER";

export interface CheckoutLabels {
  sectionDiscount: string; labelType: string;
  optionFixed: string; optionPercent: string;
  labelValue: string; labelReason: string; placeholderReason: string;
  btnApply: string; btnRemove: string;
  sectionPayment: string; warningOpenShift: string;
  labelMethod: string; methodCash: string; methodKBZ: string; methodOther: string;
  labelAmount: string; labelReference: string; placeholderReference: string;
  btnAddPayment: string; labelChangeDue: string;
}

export default function CheckoutClient(props: {
  sessionId: string;
  currency: string;
  balance: number;
  hasOpenShift: boolean;
  discount: { type: "PERCENT" | "FIXED"; value: number; reason: string | null } | null;
  labels: CheckoutLabels;
}) {
  const { labels } = props;
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
      else { onOk?.(); router.refresh(); }
    });
  }

  return (
    <div className="space-y-4">
      {msg && (
        <p className={"rounded-lg px-3 py-2 text-sm " + (msg.kind === "err" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700")}>
          {msg.text}
        </p>
      )}

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">{labels.sectionDiscount}</h3>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-gray-500">{labels.labelType}</span>
            <select value={dtype} onChange={(e) => setDtype(e.target.value as "PERCENT" | "FIXED")}
              className="rounded-lg border border-gray-300 px-3 py-2">
              <option value="FIXED">{labels.optionFixed} ({props.currency})</option>
              <option value="PERCENT">{labels.optionPercent}</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-gray-500">{labels.labelValue}</span>
            <input type="number" min={0} value={dval}
              onChange={(e) => setDval(parseInt(e.target.value || "0", 10))}
              className="w-28 rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <label className="block flex-1">
            <span className="mb-1 block text-xs text-gray-500">{labels.labelReason}</span>
            <input value={dreason} onChange={(e) => setDreason(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
              placeholder={labels.placeholderReason} />
          </label>
          <button onClick={() => run(applyDiscount(props.sessionId, dtype, dval, dreason))} disabled={pending}
            className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-60">
            {labels.btnApply}
          </button>
          {props.discount && (
            <button onClick={() => run(removeDiscount(props.sessionId))} disabled={pending}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">
              {labels.btnRemove}
            </button>
          )}
        </div>
      </section>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">{labels.sectionPayment}</h3>
        {!props.hasOpenShift && (
          <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{labels.warningOpenShift}</p>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-gray-500">{labels.labelMethod}</span>
            <select value={method} onChange={(e) => setMethod(e.target.value as Method)}
              className="rounded-lg border border-gray-300 px-3 py-2">
              <option value="CASH">{labels.methodCash}</option>
              <option value="KBZPAY">{labels.methodKBZ}</option>
              <option value="OTHER">{labels.methodOther}</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-gray-500">{labels.labelAmount}</span>
            <input type="number" min={0} value={amount}
              onChange={(e) => setAmount(parseInt(e.target.value || "0", 10))}
              className="w-32 rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <button type="button" onClick={() => setAmount(Math.max(0, props.balance))}
            className="rounded-lg border border-gray-300 px-3 py-2 text-xs hover:bg-gray-50">
            Exact ({props.balance.toLocaleString()})
          </button>
          {method !== "CASH" && (
            <label className="block flex-1">
              <span className="mb-1 block text-xs text-gray-500">{labels.labelReference}</span>
              <input value={reference} onChange={(e) => setReference(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                placeholder={labels.placeholderReference} />
            </label>
          )}
          <button
            onClick={() => run(addPayment(props.sessionId, method, amount, reference), () => setReference(""))}
            disabled={pending || !props.hasOpenShift}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
            {labels.btnAddPayment}
          </button>
        </div>
        {method === "CASH" && amount > props.balance && props.balance > 0 && (
          <div className="mt-2 flex items-center justify-between rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm">
            <span className="text-amber-700">{labels.labelChangeDue}</span>
            <span className="font-bold tabular-nums text-amber-800">
              {(amount - props.balance).toLocaleString()} {props.currency}
            </span>
          </div>
        )}
      </section>
    </div>
  );
}
