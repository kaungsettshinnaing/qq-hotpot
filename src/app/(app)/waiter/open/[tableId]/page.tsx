import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import SubmitButton from "@/components/SubmitButton";
import { openTable } from "../../actions";
import { getT } from "@/lib/lang";
import { getMenuPrices, isSpecialBuffetOffered } from "@/lib/menu";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/format";
import ErrorBanner from "@/components/ErrorBanner";

export const dynamic = "force-dynamic";

export default async function OpenTablePage({
  params,
  searchParams,
}: {
  params: Promise<{ tableId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAnyRole(["WAITER", "MANAGER", "ADMIN"]);
  const t = await getT();
  const { tableId } = await params;
  const { error: errorCode } = await searchParams;

  const table = await prisma.table.findUnique({ where: { id: tableId }, include: { area: true } });
  if (!table) redirect("/waiter");

  const open = await prisma.tableSession.findFirst({ where: { tableId, status: "OPEN" } });
  if (open) redirect(`/waiter/session/${open.id}`);

  const occupiedByMerge = await prisma.tableMerge.findFirst({ where: { tableId } });
  if (occupiedByMerge) redirect("/waiter?error=table-occupied");

  const action = openTable.bind(null, tableId);
  const [prices, settings] = await Promise.all([getMenuPrices(), getSettings()]);
  const money = (n: number) => formatMoney(n, settings.currency);
  const specialReady = await isSpecialBuffetOffered();
  const buffets = [
    {
      value: "NORMAL",
      label: t("buffet_normal"),
      prices: t("label_buffet_prices", { adult: money(prices.ADULT), child: money(prices.CHILD) }),
      disabled: false,
      checked: "peer-checked:border-brand peer-checked:bg-brand-light peer-checked:text-brand",
    },
    {
      value: "SPECIAL",
      label: t("buffet_special"),
      prices: specialReady
        ? t("label_buffet_prices", { adult: money(prices.SPECIAL_ADULT), child: money(prices.SPECIAL_CHILD) })
        : t("buffet_special_not_set"),
      disabled: !specialReady,
      checked: "peer-checked:border-gold peer-checked:bg-gold-light peer-checked:text-gold-dark",
    },
  ];

  return (
    <div className="mx-auto max-w-sm">
      <ErrorBanner code={errorCode} />
      <Link href="/waiter" className="text-sm text-brand hover:underline">
        {t("link_back_to_tables")}
      </Link>
      <div className="mt-3 rounded-2xl bg-white p-6 shadow">
        <h1 className="text-lg font-bold">
          Open table {table.label}
          <span className="ml-1 text-sm font-normal text-gray-400">Area {table.area.name}</span>
        </h1>
        <p className="mt-1 text-sm text-gray-500">{t("instruction_enter_diners")}</p>

        <form action={action} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">{t("label_adults")}</span>
              <input name="adults" type="number" min={0} defaultValue={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-lg" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">{t("label_children")}</span>
              <input name="children" type="number" min={0} defaultValue={0}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-lg" />
            </label>
          </div>
          <fieldset>
            <legend className="mb-1 block text-sm font-medium">{t("instruction_choose_buffet")}</legend>
            {/* No default on purpose: the waiter must pick one (openTable refuses a blank). */}
            <div className="grid grid-cols-2 gap-3">
              {buffets.map((b) => (
                <label key={b.value} className={b.disabled ? "cursor-not-allowed" : "cursor-pointer"}>
                  <input type="radio" name="buffetType" value={b.value} required disabled={b.disabled} className="peer sr-only" />
                  <span className={
                    "block rounded-lg border-2 border-gray-300 px-3 py-3 text-gray-700 transition " +
                    "peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-disabled:opacity-50 " + b.checked
                  }>
                    <span className="block text-base font-semibold">{b.label}</span>
                    <span className="block text-xs opacity-80">{b.prices}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <SubmitButton
            className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
            pendingText={t("pending_opening")}
          >
            {t("btn_open_table")}
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
