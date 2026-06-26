import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { hasAnyRole } from "@/lib/rbac";
import SubmitButton from "@/components/SubmitButton";
import { formatDateTime } from "@/lib/format";
import { recordAdjustment } from "./actions";
import { computeAllStockLevels } from "@/lib/inventory";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, { label: string; cls: string }> = {
  DELIVERY_IN: { label: "Delivery In",  cls: "text-green-600" },
  USAGE_OUT:   { label: "Usage Out",    cls: "text-red-600" },
  ADJUSTMENT:  { label: "Adjustment",   cls: "text-blue-600" },
};

const UNIT_LABEL: Record<string, string> = {
  UNIT: "Unit", GRAM: "Gram", KG: "KG", LITRE: "Litre", BOX: "Box", BOTTLE: "Bottle", PACK: "Pack",
};

export default async function UsagePage() {
  const session = await getSession();
  const isManager = session && hasAnyRole(session.roles, ["MANAGER", "ADMIN"]);

  const [movements, stockItems, stockMap] = await Promise.all([
    prisma.stockMovement.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        stockItem: { select: { name: true, unit: true } },
        recordedBy: { select: { name: true } },
      },
    }),
    prisma.stockItem.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    computeAllStockLevels(),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800">Stock Usage</h2>
        <Link href="/inventory/usage/new"
          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark">
          + Record Usage
        </Link>
      </div>

      {/* Manager: stock adjustment */}
      {isManager && (
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">Manual Stock Adjustment</h3>
          <p className="mb-3 text-xs text-gray-500">
            Use this to correct stock levels after a physical count or to write off damaged goods.
          </p>
          <form action={recordAdjustment} className="flex flex-wrap gap-3 text-sm">
            <select name="stockItemId" required
              className="rounded-lg border border-gray-300 px-3 py-2">
              <option value="">— Select item —</option>
              {stockItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} (current: {stockMap.get(item.id) ?? 0} {UNIT_LABEL[item.unit]})
                </option>
              ))}
            </select>
            <input name="newQty" type="number" min="0" required placeholder="New qty"
              className="w-28 rounded-lg border border-gray-300 px-3 py-2" />
            <input name="note" placeholder="Reason for adjustment"
              className="flex-1 min-w-[200px] rounded-lg border border-gray-300 px-3 py-2" />
            <SubmitButton className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
              Adjust
            </SubmitButton>
          </form>
        </section>
      )}

      {/* Movement log */}
      <section className="rounded-xl bg-white shadow-sm">
        <h3 className="border-b border-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">
          Recent movements (last 100)
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-500">
              <th className="px-4 py-2 text-left font-medium">Date / Time</th>
              <th className="px-4 py-2 text-left font-medium">Item</th>
              <th className="px-4 py-2 text-center font-medium">Type</th>
              <th className="px-4 py-2 text-center font-medium">Qty</th>
              <th className="px-4 py-2 text-left font-medium">Note</th>
              <th className="px-4 py-2 text-left font-medium">By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {movements.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  No movements yet.
                </td>
              </tr>
            )}
            {movements.map((m) => {
              const t = TYPE_LABEL[m.type] ?? { label: m.type, cls: "text-gray-600" };
              return (
                <tr key={m.id}>
                  <td className="px-4 py-2 text-gray-500 text-xs">
                    {formatDateTime(m.createdAt)}
                  </td>
                  <td className="px-4 py-2 font-medium text-gray-800">{m.stockItem.name}</td>
                  <td className={`px-4 py-2 text-center text-xs font-semibold ${t.cls}`}>{t.label}</td>
                  <td className={`px-4 py-2 text-center font-bold ${m.qty > 0 ? "text-green-600" : "text-red-600"}`}>
                    {m.qty > 0 ? `+${m.qty}` : m.qty}
                  </td>
                  <td className="px-4 py-2 text-gray-600">{m.note ?? "—"}</td>
                  <td className="px-4 py-2 text-gray-500">{m.recordedBy.name}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
