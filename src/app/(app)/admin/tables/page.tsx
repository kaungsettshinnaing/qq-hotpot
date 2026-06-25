import { prisma } from "@/lib/db";
import SubmitButton from "@/components/SubmitButton";
import { createArea, createTable, toggleArea, toggleTable } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminTablesPage() {
  const areas = await prisma.area.findMany({
    include: { tables: { orderBy: { number: "asc" } } },
    orderBy: { sortOrder: "asc" },
  });

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {areas.length === 0 && (
          <p className="text-sm text-gray-500">No areas yet. Add one on the right.</p>
        )}
        {areas.map((area) => (
          <section key={area.id} className="rounded-xl bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold">
                Area {area.name}
                {!area.isActive && (
                  <span className="ml-2 rounded bg-gray-200 px-1.5 text-xs text-gray-500">
                    hidden
                  </span>
                )}
              </h3>
              <form action={toggleArea}>
                <input type="hidden" name="id" value={area.id} />
                <button className="text-xs text-gray-500 hover:underline">
                  {area.isActive ? "Hide" : "Show"}
                </button>
              </form>
            </div>
            <div className="flex flex-wrap gap-2">
              {area.tables.map((t) => (
                <form key={t.id} action={toggleTable}>
                  <input type="hidden" name="id" value={t.id} />
                  <button
                    className={
                      "rounded-lg border px-3 py-1.5 text-sm font-medium " +
                      (t.isActive
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "border-gray-200 bg-gray-100 text-gray-400 line-through")
                    }
                    title={t.isActive ? "Click to hide" : "Click to show"}
                  >
                    {t.label}
                  </button>
                </form>
              ))}
              {area.tables.length === 0 && (
                <span className="text-sm text-gray-400">No tables.</span>
              )}
            </div>
          </section>
        ))}
      </div>

      <div className="space-y-4">
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">Add area</h3>
          <form action={createArea} className="space-y-2 text-sm">
            <input
              name="name"
              required
              placeholder="Area name (e.g. A)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
            <input
              name="sortOrder"
              type="number"
              defaultValue={areas.length + 1}
              placeholder="Sort order"
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
            <SubmitButton className="w-full rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
              Add area
            </SubmitButton>
          </form>
        </section>

        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">Add table</h3>
          <form action={createTable} className="space-y-2 text-sm">
            <select name="areaId" required className="w-full rounded-lg border border-gray-300 px-3 py-2">
              <option value="">Choose area…</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  Area {a.name}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input
                name="number"
                type="number"
                min={1}
                required
                placeholder="Number"
                className="rounded-lg border border-gray-300 px-3 py-2"
              />
              <input
                name="capacity"
                type="number"
                min={0}
                defaultValue={4}
                placeholder="Seats"
                className="rounded-lg border border-gray-300 px-3 py-2"
              />
            </div>
            <SubmitButton className="w-full rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
              Add table
            </SubmitButton>
            <p className="text-[11px] text-gray-400">
              Label is the area + number (e.g. area A + 1 → <b>A1</b>).
            </p>
          </form>
        </section>
      </div>
    </div>
  );
}
