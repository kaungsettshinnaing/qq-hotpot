"use client";

import { useState, useEffect } from "react";

export default function LiveDuration({ startAt }: { startAt: string }) {
  const [mins, setMins] = useState(0);

  useEffect(() => {
    const tick = () =>
      setMins(Math.round((Date.now() - new Date(startAt).getTime()) / 60000));
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [startAt]);

  return <>{mins} min</>;
}
