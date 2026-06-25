import { requireSession } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import AppShell from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireSession();
  const settings = await getSettings();
  return (
    <AppShell user={user} title={settings.restaurantName}>
      {children}
    </AppShell>
  );
}
