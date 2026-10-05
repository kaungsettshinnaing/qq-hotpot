import { requireSession } from "@/lib/auth";
import PayslipView from "@/components/PayslipView";

export default async function MyPayslipPage({
  params,
}: {
  params: Promise<{ yearMonth: string }>;
}) {
  // Always the signed-in user's own slip: the employee id is never read from the URL.
  const session = await requireSession();
  const { yearMonth } = await params;
  return <PayslipView yearMonth={yearMonth} employeeId={session.id} />;
}
