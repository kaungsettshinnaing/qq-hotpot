import { requireSession } from "@/lib/auth";
import TabNav from "@/components/TabNav";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

export default async function MyAccountLayout({ children }: { children: React.ReactNode }) {
  await requireSession();
  const t = await getT();
  const TABS = [
    { href: "/my-account",          label: t("tab_payslips") },
    { href: "/my-account/leave",    label: t("tab_my_leave") },
    { href: "/my-account/clock",    label: t("tab_clock_in_out") },
    { href: "/my-account/account",  label: t("tab_account") },
  ];
  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-white p-3 shadow-sm border border-gray-100">
        <TabNav tabs={TABS} />
      </div>
      {children}
    </div>
  );
}
