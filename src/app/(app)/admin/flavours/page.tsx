import { prisma } from "@/lib/db";
import SubmitButton from "@/components/SubmitButton";
import { createFlavour, toggleFlavour, moveFlavour } from "../actions";

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
            {flavours.map((f, idx) => (
              <li key={f.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span>
                  <span className={f.isActive ? "font-medium" : "font-medium text-gray-400 line-through"}>
                    {f.name}
                  </span>
                  <span className="ml-2 text-xs text-gray-400">{APPLIES_LABEL[f.appliesTo]}</span>
                </span>

                <div className="flex items-center gap-1">
                  {/* Move up */}
                  <form action={moveFlavour}>
                    <input type="hidden" name="id" value={f.id} />
                    <input type="hidden" name="direction" value="up" />
                    <button
                      type="submit"
                      disabled={idx === 0}
                      title="Move up"
                      className="rounded px-1.5 py-0.5 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      ▲
                    </button>
                  </form>

                  {/* Move down */}
                  <form action={moveFlavour}>
                    <input type="hidden" name="id" value={f.id} />
                    <input type="hidden" name="direction" value="down" />
                    <button
                      type="submit"
                      disabled={idx === flavours.length - 1}
                      title="Move down"
                      className="rounded px-1.5 py-0.5 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      ▼
                    </button>
                  </form>

                  {/* Hide / Show */}
                  <form action={toggleFlavour}>
                    <input type="hidden" name="id" value={f.id} />
                    <button className="ml-1 text-xs text-gray-500 hover:underline">
                      {f.isActive ? "Hide" : "Show"}
                    </button>
                  </form>
                </div>
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
          <SubmitButton className="w-full rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
            Add flavour
          </SubmitButton>
        </form>
      </section>
    </div>
  );
}
