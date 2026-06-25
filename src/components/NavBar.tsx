"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ModuleDef } from "@/lib/rbac";

export default function NavBar({ modules }: { modules: ModuleDef[] }) {
  const path = usePathname();
  return (
    <nav className="flex flex-wrap gap-1">
      {modules.map((m) => {
        const active = path === m.href || path.startsWith(m.href + "/");
        return (
          <Link
            key={m.key}
            href={m.href}
            className={
              "rounded-lg px-3 py-1.5 text-sm font-medium transition " +
              (active
                ? "bg-white text-brand"
                : "text-white/90 hover:bg-white/15")
            }
          >
            <span className="mr-1">{m.icon}</span>
            {m.label}
          </Link>
        );
      })}
    </nav>
  );
}
