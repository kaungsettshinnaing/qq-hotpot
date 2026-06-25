"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Periodically re-runs server components so other devices' changes show up. */
export default function AutoRefresh({ seconds = 8 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), Math.max(2, seconds) * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
