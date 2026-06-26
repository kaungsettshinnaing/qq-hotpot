"use client";

import { useState, useEffect } from "react";

export default function LiveClock({ dateStr }: { dateStr: string }) {
  const [time, setTime] = useState("");

  useEffect(() => {
    const tick = () =>
      setTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <div className="text-4xl font-bold text-brand tabular-nums">{time || "—"}</div>
      <div className="text-gray-500">{dateStr}</div>
    </>
  );
}
