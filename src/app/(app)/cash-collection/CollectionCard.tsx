"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { formatMoney } from "@/lib/format";

/** One id per form submission. Minted on the client after mount (never during SSR, so
 *  the server and client HTML agree) and re-minted after every successful submit. The
 *  server treats a repeated id as the same movement, so a double-tap or a retry of an
 *  in-flight request can only ever create one ledger row. */
function mintRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export default function CollectionCard({
  type,
  standing,
  currency,
  action,
  title,
  subtitle,
  notePlaceholder,
  submitLabel,
  pendingLabel,
  successLabel,
  standingLabel,
  overLabel,
  labelAmount,
  labelNote,
}: {
  type: "COLLECT" | "INJECT";
  standing: number;
  currency: string;
  action: (fd: FormData) => Promise<void>;
  title: string;
  subtitle: string;
  notePlaceholder: string;
  submitLabel: string;
  pendingLabel: string;
  successLabel: string;
  standingLabel: string;
  overLabel: string;
  labelAmount: string;
  labelNote: string;
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [requestId, setRequestId] = useState("");
  const [recordedAt, setRecordedAt] = useState<number | null>(null);
  const isCollect = type === "COLLECT";
  const amt = Math.max(0, Math.round(Number(amount) || 0));
  const after = isCollect ? standing - amt : standing + amt;

  useEffect(() => {
    setRequestId(mintRequestId());
  }, []);

  // The "Recorded" line clears itself so a stale confirmation never sits under a
  // fresh, unsubmitted amount.
  useEffect(() => {
    if (recordedAt === null) return;
    const id = setTimeout(() => setRecordedAt(null), 6000);
    return () => clearTimeout(id);
  }, [recordedAt]);

  async function submit(fd: FormData) {
    await action(fd);
    // Only reached when the server accepted the movement — clear the form so the
    // cashier can't resubmit the same figures by accident, and mint a fresh id for
    // the next, genuinely new, movement.
    setAmount("");
    setNote("");
    setRequestId(mintRequestId());
    setRecordedAt(Date.now());
  }

  return (
    <div className={`rounded-xl border-2 bg-white p-4 shadow-sm ${isCollect ? "border-red-200" : "border-green-200"}`}>
      <h3 className={`text-sm font-semibold ${isCollect ? "text-red-700" : "text-green-700"}`}>
        {title}
      </h3>
      <p className="mb-3 mt-0.5 text-[11px] leading-snug text-gray-400">
        {subtitle}
      </p>
      <form action={submit} className="space-y-2">
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="requestId" value={requestId} />
        <label className="block">
          <span className="mb-1 block text-xs text-gray-500">{labelAmount} ({currency})</span>
          <input
            name="amount"
            type="number"
            min={1}
            max={1_000_000_000}
            required
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-lg font-semibold"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-gray-500">{labelNote}</span>
          <input
            name="note"
            type="text"
            maxLength={300}
            placeholder={notePlaceholder}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>

        {amt > 0 && (
          <div className={`rounded-lg px-3 py-2 text-xs ${after < 0 ? "bg-red-50 text-red-700" : "bg-gray-50 text-gray-600"}`}>
            {standingLabel}{" "}
            <span className="font-bold tabular-nums">{formatMoney(after, currency)}</span>
            {after < 0 && (
              <span className="mt-0.5 block font-medium">
                {overLabel}
              </span>
            )}
          </div>
        )}

        {recordedAt !== null && amt === 0 && (
          <p
            role="status"
            className={`rounded-lg px-3 py-2 text-xs font-medium ${isCollect ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}
          >
            ✓ {successLabel}
          </p>
        )}

        <MovementSubmitButton isCollect={isCollect} label={submitLabel} pendingLabel={pendingLabel} />
      </form>
    </div>
  );
}

function MovementSubmitButton({
  isCollect,
  label,
  pendingLabel,
}: {
  isCollect: boolean;
  label: string;
  pendingLabel: string;
}) {
  // Disabled while the request is in flight: a second tap can't start a second
  // request. The requestId above is the guarantee; this is the visible half.
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`w-full rounded-xl py-2.5 font-semibold text-white active:scale-95 transition disabled:opacity-60 disabled:active:scale-100 ${
        isCollect ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"
      }`}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
