import { modulesFor, hasAnyRole } from "@/lib/rbac";
import type { SessionUser } from "@/lib/auth";
import { logoutAction } from "@/lib/session-actions";
import { prisma } from "@/lib/db";
import NavBar from "./NavBar";
import NotifBell from "./NotifBell";

const ROLE_PRIORITY = ["ADMIN", "MANAGER", "HR", "CASHIER", "KITCHEN", "WAITER", "MARKETING"] as const;
const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin", MANAGER: "Manager", HR: "HR",
  CASHIER: "Cashier", KITCHEN: "Kitchen", WAITER: "Waiter", MARKETING: "Marketing",
};
function primaryRole(roles: string[]): string {
  for (const r of ROLE_PRIORITY) if (roles.includes(r)) return ROLE_LABEL[r] ?? r;
  return roles[0] ?? "Staff";
}

async function markReadAction(id: string): Promise<void> {
  "use server";
  await prisma.notification.update({ where: { id }, data: { isRead: true } });
}

export default async function AppShell({
  user,
  title,
  children,
}: {
  user: SessionUser;
  title: string;
  children: React.ReactNode;
}) {
  const mods = modulesFor(user.roles);

  const showBell = hasAnyRole(user.roles, ["MANAGER", "ADMIN", "HR"]);
  const notifs = showBell
    ? await prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { id: true, message: true, isRead: true, createdAt: true },
      })
    : [];

  const serialised = notifs.map((n) => ({
    ...n,
    createdAt: n.createdAt.toISOString(),
  }));

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="sticky top-0 z-20 shadow-md"
        style={{ background: "linear-gradient(135deg, #C41E3A 0%, #9B1530 100%)" }}>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">

          {/* Logo + restaurant name */}
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border-2 border-gold bg-gold/10 text-sm font-extrabold text-gold shadow-inner">
              QQ
            </div>
            <div className="hidden sm:block leading-tight">
              <div className="text-sm font-bold text-gold tracking-wide">{title}</div>
              <div className="text-[10px] text-white/60 uppercase tracking-widest">Management</div>
            </div>
          </div>

          {/* Module nav */}
          <div className="order-3 w-full sm:order-2 sm:w-auto sm:flex-1">
            <NavBar modules={mods} />
          </div>

          {/* Right: bell + user + logout */}
          <div className="order-2 ml-auto flex items-center gap-3 sm:order-3">
            {showBell && (
              <NotifBell initialNotifs={serialised} markReadAction={markReadAction} />
            )}
            <div className="text-right leading-tight">
              <div className="text-sm font-semibold text-white">{user.name}</div>
              <div className="text-[10px] text-white/60">{primaryRole(user.roles)}</div>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 transition-colors"
              >
                Logout
              </button>
            </form>
          </div>

        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 p-4">{children}</main>

      {/* Subtle footer line */}
      <div className="h-0.5 w-full" style={{ background: "linear-gradient(90deg, #C41E3A, #E8A800, #C41E3A)" }} />
    </div>
  );
}
