"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setBuffetType } from "@/app/(app)/waiter/actions";
import type { BuffetType } from "@/lib/pricing";

/** Normal / Special buffet switch for an OPEN table (waiter session page + checkout). */
export default function BuffetSwitch(props: {
  sessionId: string;
  current: BuffetType;
  specialReady: boolean;
  labels: { title: string; normal: string; special: string; normalPrices: string; specialPrices: string; specialNotSet: string };
}) {
  const { labels } = props;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function choose(type: BuffetType) {
    if (type === props.current || pending) return;
    setError(null);
    start(async () => {
      const r = await setBuffetType(props.sessionId, type);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  const options: { type: BuffetType; label: string; prices: string; disabled: boolean }[] = [
    { type: "NORMAL", label: labels.normal, prices: labels.normalPrices, disabled: false },
    {
      type: "SPECIAL",
      label: labels.special,
      prices: props.specialReady ? labels.specialPrices : labels.specialNotSet,
      // A table already on Special keeps its button even if the price was later cleared.
      disabled: !props.specialReady && props.current !== "SPECIAL",
    },
  ];

  return (
    <section className="rounded-xl bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold text-gray-700">{labels.title}</h3>
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => {
          const active = o.type === props.current;
          return (
            <button
              key={o.type}
              type="button"
              onClick={() => choose(o.type)}
              disabled={pending || o.disabled}
              aria-pressed={active}
              className={
                "rounded-lg border px-3 py-3 text-left transition active:scale-95 disabled:opacity-50 " +
                (active
                  ? o.type === "SPECIAL"
                    ? "border-gold bg-gold-light text-gold-dark"
                    : "border-brand bg-brand-light text-brand"
                  : "border-gray-300 text-gray-600 hover:bg-gray-50")
              }
            >
              <span className="block text-sm font-semibold">{o.label}</span>
              <span className="block text-xs opacity-80">{o.prices}</span>
            </button>
          );
        })}
      </div>
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}
