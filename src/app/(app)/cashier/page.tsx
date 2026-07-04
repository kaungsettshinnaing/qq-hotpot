import Link from "next/link";
import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOpenShift, getAnyOpenShift, computeShiftTotals, getCashStanding } from "@/lib/shift";
import { getSessionDetail, type SessionDetail } from "@/lib/orders";
import { getSettings } from "@/lib/settings";
import { formatMoney, formatTime } from "@/lib/format";
import LiveRefresh from "@/components/LiveRefresh";
import SubmitButton from "@/components/SubmitButton";
import { openShift, recordCashMovement } from "./actions";
import CollectionCard from "../cash-collection/CollectionCard";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

export default async function CashierHome({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireAnyRole(["CASHIER", "MANAGER", "ADMIN"]);
  const { error } = await searchParams;
  const settings = await getSettings();
  const c = settings.currency;
  const t = await getT();

  const isManager = user.roles.includes("MANAGER") || user.roles.includes("ADMIN");
  const shift = await getOpenShift(user.id);
  const totals = shift
    ? await computeShiftTotals(shift.id, shift.openingFloat, { openedAt: shift.openedAt, closedAt: null })
    : null;
  const anyOpen = shift ? null : await getAnyOpenShift();
  const otherShift = anyOpen?.cashierId !== user.id ? anyOpen : null;
  const standingFloat = (!shift && !otherShift) ? await getCashStanding() : null;
  const otherTotals = (otherShift && isManager)
    ? await computeShiftTotals(otherShift.id, otherShift.openingFloat, { openedAt: otherShift.openedAt, closedAt: null })
    : null;

  const openSessions = await prisma.tableSession.findMany({
    where: { status: "OPEN" },
    select: { id: true },
    orderBy: { openedAt: "asc" },
  });
  const details = (
    await Promise.all(openSessions.map((s) => getSessionDetail(s.id)))
  ).filter((d): d is SessionDetail => d !== null);

  const toCollect = details.reduce((s, d) => s + Math.max(0, d.balance), 0);

  return (
    <div className="space-y-5">
      <LiveRefresh room="floor" events={["table:update"]} seconds={10} />

      {!shift && otherShift && (
        <div className="space-y-3">
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-5 space-y-1">
            <p className="text-sm font-bold text-red-800">{t("shift_handover_title")}</p>
            <p className="text-sm text-red-700">
              {t("shift_handover_body", {
                name: otherShift.cashier.name,
                time: otherShift.openedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              })}
            </p>
            <p className="text-xs text-red-500">{t("shift_handover_hint")}</p>
            {error === "shift-blocked" && (
              <p className="mt-1 text-xs font-semibold text-red-700">{t("shift_blocked_error")}</p>
            )}
          </div>
          {otherTotals && (
            <>
              <section className="rounded-xl bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-semibold text-gray-700">
                  Cash Standing — {otherShift.cashier.name}&apos;s shift
                </h3>
                <div className="space-y-1.5 text-sm">
                  <CashRow label={t("row_start_balance")} value={formatMoney(otherShift.openingFloat, c)} />
                  <CashRow label={t("row_cash_sales")} value={formatMoney(otherTotals.cashSales, c)} positive />
                  <CashRow label={t("row_cash_expenses")} value={formatMoney(otherTotals.cashExpenses, c)} negative />
                  {otherTotals.cashInjected > 0 && (
                    <CashRow label={t("row_cash_injected")} value={formatMoney(otherTotals.cashInjected, c)} positive />
                  )}
                  {otherTotals.cashWithdrawn > 0 && (
                    <CashRow label={t("row_cash_withdrawn")} value={formatMoney(otherTotals.cashWithdrawn, c)} negative />
                  )}
                  <div className="flex items-center justify-between border-t border-gray-200 pt-2 font-bold">
                    <span>{t("row_expected_in_drawer")}</span>
                    <span className="tabular-nums text-brand">{formatMoney(otherTotals.expected, c)}</span>
                  </div>
                </div>
              </section>

              <section className="rounded-xl bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-semibold text-gray-700">{t("section_cash_movement")}</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <CollectionCard
                    type="INJECT"
                    standing={otherTotals.expected}
                    currency={c}
                    action={recordCashMovement}
                    title={t("label_inject_title")}
                    subtitle={t("label_inject_subtitle")}
                    notePlaceholder={t("placeholder_inject_note")}
                    submitLabel={t("btn_inject_submit")}
                    standingLabel={t("label_expected_after")}
                    overLabel={t("label_over_standing")}
                  />
                  <CollectionCard
                    type="COLLECT"
                    standing={otherTotals.expected}
                    currency={c}
                    action={recordCashMovement}
                    title={t("label_collect_title")}
                    subtitle={t("label_collect_subtitle")}
                    notePlaceholder={t("placeholder_collect_note")}
                    submitLabel={t("btn_collect_submit")}
                    standingLabel={t("label_expected_after")}
                    overLabel={t("label_over_standing")}
                  />
                </div>
              </section>
            </>
          )}
        </div>
      )}

      {!shift && !otherShift && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-amber-800">{t("shift_ready_title")}</p>
            <p className="mt-0.5 text-xs text-amber-700">{t("shift_ready_body")}</p>
          </div>
          {standingFloat !== null && (
            <div className="rounded-lg bg-white border border-amber-200 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">{t("shift_cash_receiving")}</p>
                <p className="text-2xl font-extrabold text-gray-900 tabular-nums">
                  {formatMoney(standingFloat, c)}
                </p>
              </div>
              <span className="text-xs text-amber-600 font-medium">{t("shift_count_verify")}</span>
            </div>
          )}
          <form action={openShift}>
            <SubmitButton
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
              pendingText={t("pending_starting")}
            >
              {t("btn_start_shift")}
            </SubmitButton>
          </form>
        </div>
      )}

      {shift && (
        <>
          <section className="rounded-xl bg-brand p-5 text-white shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide opacity-70">{t("stat_today_sales")}</div>
                <div className="mt-0.5 text-3xl font-extrabold tabular-nums">
                  {formatMoney((totals?.cashSales ?? 0) + (totals?.kbzSales ?? 0) + (totals?.otherSales ?? 0), c)}
                </div>
              </div>
              <div className="text-xs opacity-60 text-right">
                {t("label_shift_since")} {formatTime(shift.openedAt)}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-white/10 px-3 py-2">
                <div className="text-[10px] uppercase opacity-70">{t("payment_method_cash")}</div>
                <div className="text-base font-bold tabular-nums">{formatMoney(totals?.cashSales ?? 0, c)}</div>
              </div>
              <div className="rounded-lg bg-white/10 px-3 py-2">
                <div className="text-[10px] uppercase opacity-70">KBZPay</div>
                <div className="text-base font-bold tabular-nums">{formatMoney(totals?.kbzSales ?? 0, c)}</div>
              </div>
              <div className="rounded-lg bg-white/10 px-3 py-2">
                <div className="text-[10px] uppercase opacity-70">{t("payment_method_other")}</div>
                <div className="text-base font-bold tabular-nums">{formatMoney(totals?.otherSales ?? 0, c)}</div>
              </div>
            </div>
          </section>

          <section className="rounded-xl bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-700">{t("section_cash_in_drawer")}</h3>
            <div className="space-y-1.5 text-sm">
              <CashRow label={t("row_start_balance")} value={formatMoney(shift.openingFloat, c)} />
              <CashRow label={t("row_cash_sales")} value={formatMoney(totals?.cashSales ?? 0, c)} positive />
              <CashRow label={t("row_cash_expenses")} value={formatMoney(totals?.cashExpenses ?? 0, c)} negative />
              {(totals?.cashInjected ?? 0) > 0 && (
                <CashRow label={t("row_cash_injected")} value={formatMoney(totals?.cashInjected ?? 0, c)} positive />
              )}
              {(totals?.cashWithdrawn ?? 0) > 0 && (
                <CashRow label={t("row_cash_withdrawn")} value={formatMoney(totals?.cashWithdrawn ?? 0, c)} negative />
              )}
              <div className="flex items-center justify-between border-t border-gray-200 pt-2 font-bold">
                <span>{t("row_expected_in_drawer")}</span>
                <span className="tabular-nums text-brand">{formatMoney(totals?.expected ?? 0, c)}</span>
              </div>
            </div>
          </section>

          <section className="rounded-xl bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-gray-700">{t("section_cash_movement")}</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <CollectionCard
                type="INJECT"
                standing={totals?.expected ?? 0}
                currency={c}
                action={recordCashMovement}
                title={t("label_inject_title")}
                subtitle={t("label_inject_subtitle")}
                notePlaceholder={t("placeholder_inject_note")}
                submitLabel={t("btn_inject_submit")}
                standingLabel={t("label_expected_after")}
                overLabel={t("label_over_standing")}
              />
              <CollectionCard
                type="COLLECT"
                standing={totals?.expected ?? 0}
                currency={c}
                action={recordCashMovement}
                title={t("label_collect_title")}
                subtitle={t("label_collect_subtitle")}
                notePlaceholder={t("placeholder_collect_note")}
                submitLabel={t("btn_collect_submit")}
                standingLabel={t("label_expected_after")}
                overLabel={t("label_over_standing")}
              />
            </div>
          </section>
        </>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <NavCard href="/cashier/tables" icon="🪑" label={t("nav_tables_reservations")} />
        <NavCard href="/cashier/expenses" icon="🧾" label={t("nav_expenses")} />
        <NavCard href="/cashier/history" icon="📋" label={t("nav_history")} />
        {shift ? (
          <Link href="/cashier/shift" className="rounded-xl border-2 border-brand bg-white p-4 shadow-sm transition hover:shadow">
            <div className="text-2xl">💰</div>
            <div className="mt-1 text-sm font-semibold text-brand">{t("btn_close_shift")}</div>
          </Link>
        ) : (
          <NavCard href="/cashier/shift" icon="💰" label={t("section_recent_closed_shifts")} />
        )}
        <div className="rounded-xl bg-brand p-4 text-white">
          <div className="text-xs uppercase opacity-80">{t("label_to_collect")}</div>
          <div className="text-xl font-bold tabular-nums">{formatMoney(toCollect, c)}</div>
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          {t("section_open_tables")} ({details.length})
        </h2>
        {details.length === 0 ? (
          <p className="text-sm text-gray-400">{t("empty_no_open_tables")}</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {details.map((d) => (
              <Link
                key={d.session.id}
                href={`/cashier/checkout/${d.session.id}`}
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-brand hover:shadow active:scale-[0.98]"
              >
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold">
                    {[d.session.table.label, ...d.session.mergedTables.map((m) => m.table.label)].join(" + ")}
                  </span>
                  <span className="text-xs text-gray-400">{d.diners} pax</span>
                </div>
                <div className="mt-2 text-2xl font-extrabold text-brand">
                  {formatMoney(d.bill.total, c)}
                </div>
                {d.paid > 0 && (
                  <div className="text-xs text-gray-500">
                    {t("label_paid")} {formatMoney(d.paid, c)} · {t("label_balance")} {formatMoney(d.balance, c)}
                  </div>
                )}
                <div className="mt-1 text-xs text-gray-400">{t("label_opened")} {formatTime(d.session.openedAt)}</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CashRow({ label, value, positive, negative }: {
  label: string; value: string; positive?: boolean; negative?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={negative ? "text-gray-500" : positive ? "text-gray-700" : "text-gray-600"}>{label}</span>
      <span className={"tabular-nums font-medium " + (positive ? "text-emerald-600" : negative ? "text-red-500" : "text-gray-700")}>
        {value}
      </span>
    </div>
  );
}

function NavCard({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link href={href} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-brand hover:shadow active:scale-[0.98]">
      <div className="text-2xl">{icon}</div>
      <div className="mt-1 text-sm font-semibold text-gray-700">{label}</div>
    </Link>
  );
}
