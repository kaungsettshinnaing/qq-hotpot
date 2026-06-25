import Link from "next/link";
import { prisma } from "@/lib/db";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default async function PayrollListPage() {
  const now = new Date();

  const payrolls = await prisma.payroll.findMany({
    include: {
      _count: { select: { items: true } },
      lockedBy: { select: { name: true } },
    },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    take: 24,
  });

  // Build last 6 months as quick links (including current)
  const recentMonths = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return { month: d.getMonth() + 1, year: d.getFullYear() };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Payroll</h1>
      </div>

      {/* Quick access — recent months */}
      <div className="flex flex-wrap gap-2">
        {recentMonths.map(({ month, year }) => {
          const slug = `${year}-${String(month).padStart(2, "0")}`;
          const existing = payrolls.find((p) => p.month === month && p.year === year);
          return (
            <Link key={slug} href={`/hr/payroll/${slug}`}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors
                ${existing?.status === "LOCKED"
                  ? "border-green-300 bg-green-50 text-green-700"
                  : existing?.status === "DRAFT"
                  ? "border-yellow-300 bg-yellow-50 text-yellow-700"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>
              {MONTHS[month - 1]} {year}
              {existing?.status === "LOCKED" && " ✓"}
              {existing?.status === "DRAFT" && " (draft)"}
            </Link>
          );
        })}
      </div>

      {/* Full list */}
      {payrolls.length > 0 && (
        <div className="rounded-xl border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left">Period</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Employees</th>
                <th className="px-4 py-2 text-left">Locked By</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {payrolls.map((p) => {
                const slug = `${p.year}-${String(p.month).padStart(2, "0")}`;
                return (
                  <tr key={p.id}>
                    <td className="px-4 py-2 font-medium">{MONTHS[p.month - 1]} {p.year}</td>
                    <td className="px-4 py-2">
                      <span className={`badge ${p.status === "LOCKED" ? "badge-green" : "badge-gray"}`}>{p.status}</span>
                    </td>
                    <td className="px-4 py-2">{p._count.items}</td>
                    <td className="px-4 py-2 text-gray-500">{p.lockedBy?.name ?? "—"}</td>
                    <td className="px-4 py-2 text-right">
                      <Link href={`/hr/payroll/${slug}`} className="text-sm text-brand hover:underline">Open →</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {payrolls.length === 0 && (
        <div className="rounded-xl border bg-white p-10 text-center text-gray-400">
          No payrolls yet. Click a month above to generate the first one.
        </div>
      )}
    </div>
  );
}
