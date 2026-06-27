import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatTime } from "@/lib/format";
import KitchenLive from "./KitchenLive";
import { deliverPot } from "./actions";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

function minutesSince(d: Date): number {
  return Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 60000));
}

export default async function KitchenPage() {
  await requireAnyRole(["KITCHEN", "MANAGER", "ADMIN"]);
  const t = await getT();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [pending, delivered] = await Promise.all([
    prisma.potOrder.findMany({
      where: { status: "PENDING", voidedAt: null },
      include: { flavours: { include: { flavour: true } }, session: { include: { table: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.potOrder.findMany({
      where: { status: "DELIVERED", deliveredAt: { gte: startOfDay } },
      include: { flavours: { include: { flavour: true } }, session: { include: { table: true } } },
      orderBy: { deliveredAt: "desc" },
      take: 24,
    }),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">{t("heading_kitchen_orders")}</h1>
        <KitchenLive
          pendingCount={pending.length}
          labelSoundOn={t("btn_sound_on")}
          labelSoundOff={t("btn_enable_sound")}
        />
      </div>

      {pending.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 p-12 text-center text-gray-400">
          {t("empty_all_caught_up")}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {pending.map((p) => {
            const wait = minutesSince(p.createdAt);
            const urgent = wait >= 10;
            return (
              <div key={p.id} className={"flex flex-col rounded-2xl border-2 bg-white p-4 shadow-sm " + (urgent ? "border-red-400" : "border-gray-200")}>
                <div className="flex items-start justify-between">
                  <div className="text-3xl font-extrabold leading-none">{p.session.table.label}</div>
                  <span className={"rounded-full px-2 py-0.5 text-xs font-bold " + (urgent ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700")}>
                    {wait}m
                  </span>
                </div>
                <div className="mt-2 text-lg font-bold">
                  {p.kind === "HOTPOT" ? t("pot_kind_hotpot") : t("pot_kind_bbq")}
                  {p.isFree ? "" : " (add-on)"}
                </div>
                <div className="text-sm text-gray-600">
                  {p.flavours.map((fl) => fl.flavour.name).join(" + ")}
                </div>
                <div className="mt-1 text-xs text-gray-400">ordered {formatTime(p.createdAt)}</div>
                <form action={deliverPot} className="mt-3">
                  <input type="hidden" name="potId" value={p.id} />
                  <button className="w-full rounded-lg bg-emerald-600 py-2.5 font-semibold text-white hover:bg-emerald-700">
                    {t("btn_mark_delivered")}
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          {t("section_delivered_today")} ({delivered.length})
        </h2>
        {delivered.length === 0 ? (
          <p className="text-sm text-gray-400">{t("empty_nothing_delivered")}</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-xl bg-white shadow-sm">
            {delivered.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span>
                  <span className="font-semibold">{p.session.table.label}</span>
                  <span className="ml-2 text-gray-500">
                    {p.kind === "HOTPOT" ? t("pot_kind_hotpot") : t("pot_kind_bbq")} ·{" "}
                    {p.flavours.map((fl) => fl.flavour.name).join(" + ")}
                  </span>
                </span>
                <span className="text-gray-400">{p.deliveredAt ? formatTime(p.deliveredAt) : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
