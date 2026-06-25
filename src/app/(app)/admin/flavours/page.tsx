import { prisma } from "@/lib/db";
import SubmitButton from "@/components/SubmitButton";
import { createFlavour, toggleFlavour } from "../actions";

export const dynamic = "force-dynamic";

const APPLIES_LABEL: Record<string, string> = {
  HOTPOT: "Hotpot only",
  BBQ: "BBQ only",
  BOTH: "Hotpot & BBQ",
};

export default async function AdminFlavoursPage() {
  const flavours = await prisma.soupFlavour.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <section className="rounded-xl bg-white shadow-sm">
          <h3 className="border-b border-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">
            Soup flavours ({flavours.length})
          </h3>
          <ul className="divide-y divide-gray-100">
            {flavours.length === 0 && (
              <li className="px-4 py-3 text-sm text-gray-400">No flavours yet.</li>
            )}
            {flavours.map((f) => (
              <li key={f.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span>
                  <span className={f.isActive ? "font-medium" : "font-medium text-gray-400 line-through"}>
                    {f.name}
                  </span>
                  <span className="ml-2 text-xs text-gray-400">{APPLIES_LABEL[f.appliesTo]}</span>
                </span>
                <form action={toggleFlavour}>
                  <input type="hidden" name="id" value={f.id} />
                  <button className="text-xs text-gray-500 hover:underline">
                    {f.isActive ? "Hide" : "Show"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">Add flavour</h3>
        <form action={createFlavour} className="space-y-2 text-sm">
          <input
            name="name"
            required
            placeholder="Flavour name"
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
          <select name="appliesTo" className="w-full rounded-lg border border-gray-300 px-3 py-2">
            <option value="BOTH">Hotpot &amp; BBQ</option>
            <option value="HOTPOT">Hotpot only</option>
            <option value="BBQ">BBQ only</option>
          </select>
          <input
            name="sortOrder"
            type="number"
            defaultValue={flavours.length + 1}
            placeholder="Sort order"
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
          <SubmitButton className="w-full rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
            Add flavour
          </SubmitButton>
        </form>
      </section>
    </div>
  );
}
