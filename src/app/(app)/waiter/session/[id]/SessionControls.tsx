"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateHeadcount, addPot, setBeerQty, setWastage, setItemQty } from "../../actions";
import type { ActionResult } from "@/lib/action-result";

interface Flavour { id: string; name: string; appliesTo: "HOTPOT" | "BBQ" | "BOTH" }
interface OrderableItem { code: string; name: string; price: number; category: string }

export interface SessionLabels {
  diners: string; adults: string; children: string; saveDiners: string;
  addPot: string; nextPotFree: string; nextPotPaid: string;
  hotpot: string; bbq: string;
  soupFlavour1: string; soupFlavour2: string; soupFlavour: string; choose: string;
  sendPot: string; beer: string; wastage: string; save: string; menuItems: string;
}

export default function SessionControls(props: {
  sessionId: string;
  initialAdults: number; initialChildren: number;
  beerQty: number; wastageGrams: number;
  allowance: number; totalPots: number;
  flavours: Flavour[]; orderableItems: OrderableItem[];
  itemQtys: Record<string, number>;
  labels: SessionLabels;
}) {
  const { labels } = props;
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
  const [itemQtys, setItemQtys] = useState<Record<string, number>>(props.itemQtys);

  function run(promise: Promise<ActionResult>, onOk?: () => void) {
    setMsg(null);
    start(async () => {
      const r = await promise;
      if (!r.ok) setMsg({ kind: "err", text: r.error });
      else { onOk?.(); router.refresh(); }
    });
  }

  const hotpot = props.flavours.filter((f) => f.appliesTo === "HOTPOT" || f.appliesTo === "BOTH");
  const bbq    = props.flavours.filter((f) => f.appliesTo === "BBQ"    || f.appliesTo === "BOTH");
  const pool = kind === "HOTPOT" ? hotpot : bbq;
  const nextPotFree = props.totalPots < props.allowance;

  function addPotNow() {
    const ids = kind === "HOTPOT" ? [f1, f2] : [f1];
    if (ids.some((x) => !x)) {
      setMsg({ kind: "err", text: `${kind === "HOTPOT" ? labels.soupFlavour1 + " & " + labels.soupFlavour2 : labels.soupFlavour}` });
      return;
    }
    run(addPot(props.sessionId, kind, ids), () => { setF1(""); setF2(""); });
  }

  function changeBeer(next: number) {
    const q = Math.max(0, next); setBeer(q); run(setBeerQty(props.sessionId, q));
  }
  function changeItem(code: string, next: number) {
    const q = Math.max(0, next);
    setItemQtys((prev) => ({ ...prev, [code]: q }));
    run(setItemQty(props.sessionId, code, q));
  }

  return (
    <div className="space-y-4">
      {msg && (
        <p className={"rounded-lg px-3 py-2 text-sm " + (msg.kind === "err" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700")}>
          {msg.text}
        </p>
      )}

      {/* Headcount */}
      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">{labels.diners}</h3>
        <div className="flex flex-wrap items-end gap-4">
          <Stepper label={labels.adults}   value={adults}   onChange={setAdults} />
          <Stepper label={labels.children} value={children} onChange={setChildren} />
          <button onClick={() => run(updateHeadcount(props.sessionId, adults, children))}
            disabled={pending}
            className="rounded-lg bg-gray-800 px-5 py-3 text-sm font-semibold text-white hover:bg-gray-900 active:scale-95 disabled:opacity-60">
            {labels.saveDiners}
          </button>
        </div>
      </section>

      {/* Add pot */}
      <section className="rounded-xl bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">{labels.addPot}</h3>
          <span className={"rounded-full px-2 py-0.5 text-xs font-semibold " + (nextPotFree ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
            {nextPotFree ? labels.nextPotFree : labels.nextPotPaid} · {props.totalPots}/{props.allowance}
          </span>
        </div>

        <div className="mb-3 flex gap-2">
          {(["HOTPOT", "BBQ"] as const).map((k) => (
            <button key={k} onClick={() => { setKind(k); setF1(""); setF2(""); }}
              className={"flex-1 rounded-lg border py-3 text-sm font-semibold active:scale-95 transition " + (kind === k ? "border-brand bg-brand-light text-brand" : "border-gray-300 text-gray-600")}>
              {k === "HOTPOT" ? labels.hotpot : labels.bbq}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <FlavourSelect label={kind === "HOTPOT" ? labels.soupFlavour1 : labels.soupFlavour}
            value={f1} onChange={setF1} options={pool} choose={labels.choose} />
          {kind === "HOTPOT" && (
            <FlavourSelect label={labels.soupFlavour2} value={f2} onChange={setF2} options={pool} choose={labels.choose} />
          )}
        </div>

        <button onClick={addPotNow} disabled={pending}
          className="mt-3 w-full rounded-lg bg-brand py-4 text-base font-bold text-white hover:bg-brand-dark active:scale-95 transition disabled:opacity-60">
          {labels.sendPot}
        </button>
      </section>

      {/* Beer + wastage */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">{labels.beer}</h3>
          <div className="flex items-center gap-4">
            <button onClick={() => changeBeer(beer - 1)} disabled={pending || beer <= 0}
              className="h-12 w-12 rounded-xl bg-gray-200 text-2xl font-bold active:scale-95 transition disabled:opacity-50">−</button>
            <span className="w-10 text-center text-3xl font-bold tabular-nums">{beer}</span>
            <button onClick={() => changeBeer(beer + 1)} disabled={pending}
              className="h-12 w-12 rounded-xl bg-gray-200 text-2xl font-bold active:scale-95 transition disabled:opacity-50">+</button>
          </div>
        </div>

        <div className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">{labels.wastage}</h3>
          <div className="flex items-center gap-2">
            <input type="number" min={0} value={wastage}
              onChange={(e) => setWastageVal(parseInt(e.target.value || "0", 10))}
              className="w-28 rounded-lg border border-gray-300 px-3 py-3 text-lg" />
            <button onClick={() => run(setWastage(props.sessionId, wastage))} disabled={pending}
              className="rounded-lg bg-gray-800 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-900 active:scale-95 transition disabled:opacity-60">
              {labels.save}
            </button>
          </div>
        </div>
      </section>

      {/* Extra menu items */}
      {props.orderableItems.length > 0 && (
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">{labels.menuItems}</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {props.orderableItems.map((item) => {
              const qty = itemQtys[item.code] ?? 0;
              return (
                <div key={item.code} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-gray-800">{item.name}</div>
                    {item.category && <div className="text-[10px] text-gray-400">{item.category}</div>}
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <button onClick={() => changeItem(item.code, qty - 1)} disabled={pending || qty <= 0}
                      className="h-10 w-10 rounded-lg bg-gray-200 text-lg font-bold active:scale-95 transition disabled:opacity-40">−</button>
                    <span className="w-7 text-center text-base font-bold tabular-nums">{qty}</span>
                    <button onClick={() => changeItem(item.code, qty + 1)} disabled={pending}
                      className="h-10 w-10 rounded-lg bg-gray-200 text-lg font-bold active:scale-95 transition disabled:opacity-40">+</button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-gray-500">{label}</div>
      <div className="flex items-center gap-2">
        <button onClick={() => onChange(Math.max(0, value - 1))}
          className="h-12 w-12 rounded-xl bg-gray-200 text-2xl font-bold active:scale-95 transition">−</button>
        <input type="number" min={0} value={value}
          onChange={(e) => onChange(Math.max(0, parseInt(e.target.value || "0", 10)))}
          className="w-16 rounded-lg border border-gray-300 px-2 py-2.5 text-center text-lg font-bold" />
        <button onClick={() => onChange(value + 1)}
          className="h-12 w-12 rounded-xl bg-gray-200 text-2xl font-bold active:scale-95 transition">+</button>
      </div>
    </div>
  );
}

function FlavourSelect({ label, value, onChange, options, choose }: {
  label: string; value: string; onChange: (v: string) => void; options: Flavour[]; choose: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2">
        <option value="">{choose}</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );
}
