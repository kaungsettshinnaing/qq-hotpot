import { modulesFor } from "@/lib/rbac";
import type { SessionUser } from "@/lib/auth";
import { logoutAction } from "@/lib/session-actions";
import { prisma } from "@/lib/db";
import { hasAnyRole } from "@/lib/rbac";
import NavBar from "./NavBar";
import NotifBell from "./NotifBell";

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

  // Only load notifications for roles that receive them
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
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 bg-brand text-white shadow">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <div className="flex items-center gap-2 font-bold">
            <span className="text-lg">🍲</span>
            <span className="hidden sm:inline">{title}</span>
          </div>
          <div className="order-3 w-full sm:order-2 sm:w-auto sm:flex-1">
            <NavBar modules={mods} />
          </div>
          <div className="order-2 ml-auto flex items-center gap-3 sm:order-3">
            {showBell && (
              <NotifBell initialNotifs={serialised} markReadAction={markReadAction} />
            )}
            <div className="text-right leading-tight">
              <div className="text-sm font-medium">{user.name}</div>
              <div className="text-[11px] text-white/70">{user.roles.join(" · ")}</div>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-lg bg-white/15 px-3 py-1.5 text-sm font-medium hover:bg-white/25"
              >
                Logout
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 p-4">{children}</main>
    </div>
  );
}
