"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useRoomRefresh } from "@/lib/socket-client";

function playBeep(ctx: AudioContext, offset = 0) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = "sine";
  osc.frequency.value = 880;
  const t = ctx.currentTime + offset;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
  osc.start(t);
  osc.stop(t + 0.37);
}

function playThreeBeeps(ctx: AudioContext | null) {
  if (!ctx) return;
  playBeep(ctx, 0);
  playBeep(ctx, 0.18);
  playBeep(ctx, 0.36);
}

export default function KitchenLive({ pendingCount }: { pendingCount: number }) {
  const router = useRouter();

  // Instant updates via socket, plus a 5s polling fallback.
  useRoomRefresh("kitchen", ["pot:new", "pot:void", "pot:delivered"]);
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(id);
  }, [router]);

  // 3 beeps every 10s while any order is pending (needs a user gesture to start audio).
  const [soundOn, setSoundOn] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const countRef = useRef(pendingCount);
  countRef.current = pendingCount;

  useEffect(() => {
    if (!soundOn) return;
    const beep = () => {
      if (countRef.current > 0) playThreeBeeps(ctxRef.current);
    };
    beep();
    const id = setInterval(beep, 10000);
    return () => clearInterval(id);
  }, [soundOn]);

  function enableSound() {
    if (!ctxRef.current) {
      const w = window as unknown as {
        AudioContext: typeof AudioContext;
        webkitAudioContext?: typeof AudioContext;
      };
      const AC = w.AudioContext || w.webkitAudioContext;
      if (AC) ctxRef.current = new AC();
    }
    void ctxRef.current?.resume();
    setSoundOn(true);
  }

  return (
    <div className="flex items-center gap-3">
      <span
        className={
          "rounded-full px-3 py-1 text-sm font-semibold " +
          (pendingCount > 0 ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500")
        }
      >
        {pendingCount} pending
      </span>
      {soundOn ? (
        <span className="text-sm text-emerald-700">🔔 Sound on</span>
      ) : (
        <button
          onClick={enableSound}
          className="rounded-lg bg-gray-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-900"
        >
          🔔 Enable sound
        </button>
      )}
    </div>
  );
}
