"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ModuleDef } from "@/lib/rbac";

export default function NavBar({ modules }: { modules: ModuleDef[] }) {
  const path = usePathname();
  return (
    <nav className="flex flex-wrap gap-1.5">
      {modules.map((m) => {
        const active = path === m.href || path.startsWith(m.href + "/");
        return (
          <Link
            key={m.key}
            href={m.href}
            className={
              "rounded-full px-3 py-1 text-sm font-medium transition-all " +
              (active
                ? "bg-gold text-brand-dark shadow-sm"
                : "text-white/80 hover:bg-white/15 hover:text-white")
            }
          >
            <span className="mr-1 text-xs">{m.icon}</span>
            {m.label}
          </Link>
        );
      })}
    </nav>
  );
}
