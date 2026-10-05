import { requireAnyRole } from "@/lib/auth";
import PayslipView from "@/components/PayslipView";

export default async function PayslipPage({
  params,
}: {
  params: Promise<{ yearMonth: string; employeeId: string }>;
}) {
  // Individual payslip has net pay, advance/fine deductions: HR/ADMIN only here.
  // Employees see their own via /my-account/payslips/[yearMonth].
  await requireAnyRole(["HR", "ADMIN"]);
  const { yearMonth, employeeId } = await params;
  return <PayslipView yearMonth={yearMonth} employeeId={employeeId} />;
}
