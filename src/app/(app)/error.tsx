"use client";

import { useEffect } from "react";
import { unstable_isUnrecognizedActionError as isUnrecognizedActionError } from "next/navigation";

/**
 * Catches errors thrown while rendering/acting inside the app shell, so a failure in one
 * page leaves the nav bar usable and offers a retry instead of the blank production
 * "Application error" screen.
 *
 * "Server Action was not found" means this tab was loaded before the latest deploy
 * (action ids change per build). A reload picks up the new build, so do it automatically.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const digest = error.digest;
  const stale = isUnrecognizedActionError(error);

  useEffect(() => {
    if (stale) window.location.reload();
    else console.error(error);
  }, [error, stale]);

  if (stale) {
    return <p className="p-6 text-center text-sm text-gray-500">Updating… / ပြန်လည်ဖွင့်နေသည်…</p>;
  }

  return (
    <div className="mx-auto max-w-md space-y-3 rounded-xl bg-white p-6 text-center shadow-sm">
      <h2 className="text-lg font-bold">Something went wrong / တစ်ခုခု မှားယွင်းသွားသည်</h2>
      <p className="text-sm text-gray-500">
        Your last action may not have gone through — check before repeating it.
        <br />
        နောက်ဆုံးလုပ်ဆောင်ချက် မအောင်မြင်ခဲ့နိုင်ပါ — ထပ်မလုပ်မီ စစ်ဆေးပါ။
      </p>
      {digest && <p className="text-xs text-gray-400">Ref: {digest}</p>}
      <div className="flex justify-center gap-2">
        <button onClick={() => reset()} className="btn-brand">Try again / ထပ်စမ်းမည်</button>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Reload / ပြန်ဖွင့်မည်
        </button>
      </div>
    </div>
  );
}
