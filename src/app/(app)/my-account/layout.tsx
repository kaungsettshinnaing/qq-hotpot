import { requireSession } from "@/lib/auth";
import TabNav from "@/components/TabNav";

export const dynamic = "force-dynamic";

const TABS = [
  { href: "/my-account",          label: "Payslips" },
  { href: "/my-account/leave",    label: "My Leave" },
  { href: "/my-account/clock",    label: "Clock In/Out" },
  { href: "/my-account/account",  label: "Account" },
];

export default async function MyAccountLayout({ children }: { children: React.ReactNode }) {
  await requireSession();
  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-white p-3 shadow-sm border border-gray-100">
        <TabNav tabs={TABS} />
      </div>
      {children}
    </div>
  );
}
