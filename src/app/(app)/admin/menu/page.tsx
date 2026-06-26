import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import SubmitButton from "@/components/SubmitButton";
import { updateMenuItem, createMenuItem, toggleMenuItem, updateSettings } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminMenuPage() {
  const [items, settings] = await Promise.all([
    prisma.menuItem.findMany({ orderBy: { name: "asc" } }),
    getSettings(),
  ]);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      {/* Menu prices + add item */}
      <div className="space-y-4 lg:col-span-2">
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">
            Menu prices ({settings.currency})
          </h3>
          <div className="space-y-2">
            {items.map((it) => (
              <div key={it.code} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 p-2">
                <form action={updateMenuItem} className="flex flex-1 items-center gap-2">
                  <input type="hidden" name="code" value={it.code} />
                  <input
                    name="name"
                    defaultValue={it.name}
                    className={
                      "flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm " +
                      (!it.isActive ? "text-gray-400 line-through" : "")
                    }
                  />
                  <input
                    name="price"
                    type="number"
                    min={0}
                    defaultValue={it.price}
                    className="w-28 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                  />
                  <span className="w-14 text-xs text-gray-400">
                    /{it.unit === "GRAM" ? "gram" : "unit"}
                  </span>
                  <SubmitButton className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-900 disabled:opacity-60">
                    Save
                  </SubmitButton>
                </form>
                <form action={toggleMenuItem}>
                  <input type="hidden" name="code" value={it.code} />
                  <button className="text-xs text-gray-500 hover:underline">
                    {it.isActive ? "Hide" : "Show"}
                  </button>
                </form>
              </div>
            ))}
            {items.length === 0 && (
              <p className="text-sm text-gray-400">No menu items yet. Add one below.</p>
            )}
          </div>
        </section>

        {/* Add new item */}
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">Add menu item</h3>
          <form action={createMenuItem} className="flex flex-wrap items-end gap-2 text-sm">
            <label className="block flex-1 min-w-40">
              <span className="mb-1 block text-xs font-medium text-gray-500">Item name</span>
              <input
                name="name"
                required
                placeholder="e.g. Soft Drink"
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="block w-32">
              <span className="mb-1 block text-xs font-medium text-gray-500">Price ({settings.currency})</span>
              <input
                name="price"
                type="number"
                min={0}
                defaultValue={0}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="block w-28">
              <span className="mb-1 block text-xs font-medium text-gray-500">Unit</span>
              <select name="unit" className="w-full rounded-lg border border-gray-300 px-3 py-2">
                <option value="UNIT">per unit</option>
                <option value="GRAM">per gram</option>
              </select>
            </label>
            <SubmitButton className="rounded-lg bg-brand px-5 py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
              Add item
            </SubmitButton>
          </form>
        </section>
      </div>

      {/* Settings */}
      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">Restaurant settings</h3>
        <form action={updateSettings} className="space-y-3 text-sm">
          <Field label="Restaurant name">
            <input
              name="restaurantName"
              defaultValue={settings.restaurantName}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Currency">
              <input
                name="currency"
                defaultValue={settings.currency}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </Field>
            <Field label="Reservation block (min)">
              <input
                name="reservationBlockMins"
                type="number"
                min={0}
                defaultValue={settings.reservationBlockMins}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Free pot: 1 per N diners">
              <input
                name="freePotRatio"
                type="number"
                min={1}
                defaultValue={settings.freePotRatio}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </Field>
            <Field label="Rounding">
              <select
                name="freePotRounding"
                defaultValue={settings.freePotRounding}
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              >
                <option value="UP">Round up (generous)</option>
                <option value="DOWN">Round down (min 1)</option>
              </select>
            </Field>
          </div>

          <fieldset className="rounded-lg border border-gray-200 p-3">
            <legend className="px-1 text-xs text-gray-500">Service charge</legend>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="serviceEnabled"
                defaultChecked={settings.serviceEnabled}
              />
              Enable service charge
            </label>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-gray-500">Rate %</span>
              <input
                name="serviceRatePct"
                type="number"
                step="0.1"
                min={0}
                max={100}
                defaultValue={settings.serviceRatePct}
                className="w-24 rounded-lg border border-gray-300 px-2 py-1.5"
              />
            </div>
          </fieldset>

          <fieldset className="rounded-lg border border-gray-200 p-3">
            <legend className="px-1 text-xs text-gray-500">Commercial tax</legend>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="taxEnabled" defaultChecked={settings.taxEnabled} />
              Enable tax
            </label>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-gray-500">Rate %</span>
              <input
                name="taxRatePct"
                type="number"
                step="0.1"
                min={0}
                max={100}
                defaultValue={settings.taxRatePct}
                className="w-24 rounded-lg border border-gray-300 px-2 py-1.5"
              />
            </div>
          </fieldset>

          <SubmitButton className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
            Save settings
          </SubmitButton>
        </form>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      {children}
    </label>
  );
}
