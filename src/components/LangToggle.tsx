"use client";
import type { Lang } from "@/lib/i18n";

export default function LangToggle({ lang }: { lang: Lang }) {
  function toggle() {
    const next = lang === "en" ? "my" : "en";
    document.cookie = `lang=${next}; path=/; max-age=31536000; samesite=lax`;
    location.reload();
  }
  return (
    <button
      onClick={toggle}
      title={lang === "en" ? "Switch to Burmese / မြန်မာသို့ပြောင်းရန်" : "Switch to English"}
      className="rounded-full border border-white/30 bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-white/20 transition-colors"
    >
      {lang === "en" ? "မြန်မာ" : "EN"}
    </button>
  );
}
