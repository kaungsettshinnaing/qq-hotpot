import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function ManagerExpensesPage() {
  redirect("/reports?tab=expenses");
}
