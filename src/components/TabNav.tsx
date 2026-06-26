"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type TabDef = { href: string; label: string };

export default function TabNav({ tabs }: { tabs: TabDef[] }) {
  const path = usePathname();
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((t) => {
        const active = path === t.href || path.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            className={
              "rounded-full px-4 py-1.5 text-sm font-medium transition-all " +
              (active
                ? "bg-brand text-white shadow-sm"
                : "bg-white border border-gray-200 text-gray-600 hover:border-brand/40 hover:text-brand")
            }
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
