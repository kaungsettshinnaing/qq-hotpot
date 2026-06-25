// Role-based access control. Pure module (no Node/Prisma imports) so it is safe
// to use in middleware (edge) and client components.

export type Role =
  | "WAITER"
  | "KITCHEN"
  | "CASHIER"
  | "MANAGER"
  | "ADMIN"
  | "HR"
  | "MARKETING";

export const ALL_ROLES: Role[] = [
  "WAITER",
  "KITCHEN",
  "CASHIER",
  "MANAGER",
  "ADMIN",
  "HR",
  "MARKETING",
];

export interface ModuleDef {
  key: string;
  label: string;
  href: string;
  roles: Role[]; // any of these grants access
  icon: string;
}

// Modules available in the POS phase. Managers/Admins get oversight access to
// operational screens; HR/Marketing are seeded for future modules.
export const MODULES: ModuleDef[] = [
  { key: "waiter", label: "Waiter", href: "/waiter", roles: ["WAITER", "MANAGER", "ADMIN"], icon: "🍽️" },
  { key: "kitchen", label: "Kitchen", href: "/kitchen", roles: ["KITCHEN", "MANAGER", "ADMIN"], icon: "🍲" },
  { key: "cashier", label: "Cashier", href: "/cashier", roles: ["CASHIER", "MANAGER", "ADMIN"], icon: "💵" },
  { key: "reports", label: "Reports", href: "/reports", roles: ["MANAGER", "ADMIN"], icon: "📊" },
  { key: "admin", label: "Admin", href: "/admin", roles: ["ADMIN"], icon: "⚙️" },
];

export function hasAnyRole(userRoles: Role[], allowed: Role[]): boolean {
  return userRoles.some((r) => allowed.includes(r));
}

export function modulesFor(userRoles: Role[]): ModuleDef[] {
  return MODULES.filter((m) => hasAnyRole(userRoles, m.roles));
}

// Where to send a user after login, based on their highest-priority role.
const ROLE_PRIORITY: Role[] = ["ADMIN", "MANAGER", "CASHIER", "KITCHEN", "WAITER", "HR", "MARKETING"];
const LANDING: Record<Role, string> = {
  ADMIN: "/admin",
  MANAGER: "/reports",
  CASHIER: "/cashier",
  KITCHEN: "/kitchen",
  WAITER: "/waiter",
  HR: "/",
  MARKETING: "/",
};

export function landingFor(userRoles: Role[]): string | null {
  const mods = modulesFor(userRoles);
  if (mods.length === 0) return null;
  for (const r of ROLE_PRIORITY) {
    if (userRoles.includes(r)) {
      const href = LANDING[r];
      if (mods.some((m) => m.href === href)) return href;
    }
  }
  return mods[0].href;
}

// Access rules per top-level route, enforced server-side in each layout.
export const ROUTE_ROLES: Record<string, Role[]> = {
  "/waiter": ["WAITER", "MANAGER", "ADMIN"],
  "/kitchen": ["KITCHEN", "MANAGER", "ADMIN"],
  "/cashier": ["CASHIER", "MANAGER", "ADMIN"],
  "/reports": ["MANAGER", "ADMIN"],
  "/admin": ["ADMIN"],
};
