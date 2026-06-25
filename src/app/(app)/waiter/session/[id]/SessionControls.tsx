"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateHeadcount, addPot, setBeerQty, setWastage } from "../../actions";
import type { ActionResult } from "@/lib/action-result";

interface Flavour {
  id: string;
  name: string;
  appliesTo: "HOTPOT" | "BBQ" | "BOTH";
}

export default function SessionControls(props: {
  sessionId: string;
  initialAdults: number;
  initialChildren: number;
  beerQty: number;
  wastageGrams: number;
  allowance: number;
  totalPots: number;
  flavours: Flavour[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "err" | "ok"; text: string } | null>(null);

  const [adults, setAdults] = useState(props.initialAdults);
  const [children, setChildren] = useState(props.initialChildren);

  const [kind, setKind] = useState<"HOTPOT" | "BBQ">("HOTPOT");
  const [f1, setF1] = useState("");
  const [f2, setF2] = useState("");

  const [beer, setBeer] = useState(props.beerQty);
  const [wastage, setWastageVal] = useState(props.wastageGrams);

  function run(promise: Promise<ActionResult>, onOk?: () => void) {
    setMsg(null);
    start(async () => {
      const r = await promise;
      if (!r.ok) {
        setMsg({ kind: "err", text: r.error });
      } else {
        onOk?.();
        router.refresh();
      }
    });
  }

  const hotpot = props.flavours.filter((f) => f.appliesTo === "HOTPOT" || f.appliesTo === "BOTH");
  const bbq = props.flavours.filter((f) => f.appliesTo === "BBQ" || f.appliesTo === "BOTH");
  const pool = kind === "HOTPOT" ? hotpot : bbq;
  const nextPotFree = props.totalPots < props.allowance;

  function addPotNow() {
    const ids = kind === "HOTPOT" ? [f1, f2] : [f1];
    if (ids.some((x) => !x)) {
      setMsg({ kind: "err", text: `Choose ${kind === "HOTPOT" ? 2 : 1} soup flavour(s).` });
      return;
    }
    run(addPot(props.sessionId, kind, ids), () => {
      setF1("");
      setF2("");
    });
  }

  function changeBeer(next: number) {
    const q = Math.max(0, next);
    setBeer(q);
    run(setBeerQty(props.sessionId, q));
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

      {/* Headcount */}
      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">Diners</h3>
        <div className="flex flex-wrap items-end gap-4">
          <Stepper label="Adults" value={adults} onChange={setAdults} />
          <Stepper label="Children" value={children} onChange={setChildren} />
          <button
            onClick={() => run(updateHeadcount(props.sessionId, adults, children))}
            disabled={pending}
            className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-60"
          >
            Save diners
          </button>
        </div>
      </section>

      {/* Add pot */}
      <section className="rounded-xl bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Add a pot</h3>
          <span
            className={
              "rounded-full px-2 py-0.5 text-xs font-semibold " +
              (nextPotFree ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")
            }
          >
            Next pot: {nextPotFree ? "FREE" : "PAID add-on"} · {props.totalPots}/{props.allowance} free used
          </span>
        </div>

        <div className="mb-3 flex gap-2">
          {(["HOTPOT", "BBQ"] as const).map((k) => (
            <button
              key={k}
              onClick={() => {
                setKind(k);
                setF1("");
                setF2("");
              }}
              className={
                "flex-1 rounded-lg border px-3 py-2 text-sm font-semibold " +
                (kind === k ? "border-brand bg-brand-light text-brand" : "border-gray-300 text-gray-600")
              }
            >
              {k === "HOTPOT" ? "🍲 Hotpot" : "🔥 BBQ"}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <FlavourSelect
            label={kind === "HOTPOT" ? "Soup flavour 1" : "Soup flavour"}
            value={f1}
            onChange={setF1}
            options={pool}
          />
          {kind === "HOTPOT" && (
            <FlavourSelect label="Soup flavour 2" value={f2} onChange={setF2} options={pool} />
          )}
        </div>

        <button
          onClick={addPotNow}
          disabled={pending}
          className="mt-3 w-full rounded-lg bg-brand py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
        >
          Send pot to kitchen
        </button>
      </section>

      {/* Beer + wastage */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">Beer 🍺</h3>
          <div className="flex items-center gap-3">
            <button
              onClick={() => changeBeer(beer - 1)}
              disabled={pending || beer <= 0}
              className="h-10 w-10 rounded-lg bg-gray-200 text-xl font-bold disabled:opacity-50"
            >
              −
            </button>
            <span className="w-10 text-center text-2xl font-bold tabular-nums">{beer}</span>
            <button
              onClick={() => changeBeer(beer + 1)}
              disabled={pending}
              className="h-10 w-10 rounded-lg bg-gray-200 text-xl font-bold disabled:opacity-50"
            >
              +
            </button>
          </div>
        </div>

        <div className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">Wastage (grams)</h3>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              value={wastage}
              onChange={(e) => setWastageVal(parseInt(e.target.value || "0", 10))}
              className="w-28 rounded-lg border border-gray-300 px-3 py-2"
            />
            <button
              onClick={() => run(setWastage(props.sessionId, wastage))}
              disabled={pending}
              className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-60"
            >
              Save
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Stepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-gray-500">{label}</div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(Math.max(0, value - 1))}
          className="h-9 w-9 rounded-lg bg-gray-200 text-lg font-bold"
        >
          −
        </button>
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(Math.max(0, parseInt(e.target.value || "0", 10)))}
          className="w-14 rounded-lg border border-gray-300 px-2 py-1.5 text-center"
        />
        <button
          onClick={() => onChange(value + 1)}
          className="h-9 w-9 rounded-lg bg-gray-200 text-lg font-bold"
        >
          +
        </button>
      </div>
    </div>
  );
}

function FlavourSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Flavour[];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2"
      >
        <option value="">— choose —</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
