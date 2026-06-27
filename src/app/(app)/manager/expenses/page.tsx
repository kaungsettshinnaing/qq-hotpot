import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { formatMoney } from "@/lib/format";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

async function confirmExpense(fd: FormData) {
  "use server";
  const session = await requireAnyRole(["MANAGER", "ADMIN"]);
  const id = fd.get("id") as string;
  await prisma.expense.update({
    where: { id },
    data: { confirmedAt: new Date(), confirmedById: session.id },
  });
  revalidatePath("/manager/expenses");
  revalidatePath("/accounting");
}

function fmtDate(d: Date) { return d.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" }); }
function fmtTime(d: Date) { return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }

export default async function ManagerExpensesPage() {
  await requireAnyRole(["MANAGER", "ADMIN"]);
  const t = await getT();

  const [unconfirmed, confirmed] = await Promise.all([
    prisma.expense.findMany({
      where: { confirmedAt: null },
      include: { category: { select: { name: true } }, enteredBy: { select: { name: true } }, attachments: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.expense.findMany({
      where: { confirmedAt: { not: null } },
      include: {
        category: { select: { name: true } }, enteredBy: { select: { name: true } },
        confirmedBy: { select: { name: true } }, attachments: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-600">
          {t("badge_expense_awaiting")} ({unconfirmed.length})
        </h2>
        {unconfirmed.length === 0 ? (
          <p className="rounded-xl border bg-white px-4 py-6 text-center text-sm text-gray-400">
            {t("msg_all_confirmed")}
          </p>
        ) : (
          unconfirmed.map((e) => (
            <div key={e.id} className="rounded-xl border border-amber-100 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-bold tabular-nums">{formatMoney(e.amount)}</span>
                    <span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold " +
                      (e.paymentSource === "CASH_DRAWER" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700")}>
                      {e.paymentSource === "CASH_DRAWER" ? t("source_cash_drawer") : t("source_bank_transfer")}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm font-medium text-gray-800">{e.description}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {e.category.name}
                    {e.vendor && <> · {e.vendor}</>}
                    {" · "}{fmtDate(e.businessDate)} · {t("label_entered_by")} {e.enteredBy.name} {t("label_at")} {fmtTime(e.createdAt)}
                  </p>
                  {e.attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {e.attachments.map((a) => (
                        <a key={a.id} href={`/api/uploads/${a.filePath}`} target="_blank" rel="noopener noreferrer" className="block">
                          <img src={`/api/uploads/${a.filePath}`} alt="receipt"
                            className="h-20 w-20 rounded-lg border object-cover shadow-sm hover:opacity-80 transition" />
                        </a>
                      ))}
                    </div>
                  )}
                  {e.attachments.length === 0 && (
                    <p className="mt-1.5 text-[11px] italic text-gray-400">{t("label_no_receipt")}</p>
                  )}
                </div>
                <form action={confirmExpense} className="flex-shrink-0">
                  <input type="hidden" name="id" value={e.id} />
                  <button type="submit"
                    className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 active:scale-95 transition">
                    {t("btn_confirm")}
                  </button>
                </form>
              </div>
            </div>
          ))
        )}
      </div>

      {confirmed.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
            {t("badge_expense_confirmed")} — {t("label_last_50")}
          </h2>
          <div className="rounded-xl border bg-white divide-y overflow-hidden">
            {confirmed.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{formatMoney(e.amount)}</span>
                    <span className="text-sm text-gray-700">{e.description}</span>
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                      {t("badge_expense_confirmed")}
                    </span>
                    {e.attachments.length > 0 && (
                      <span className="text-[11px] text-gray-400">
                        {e.attachments.length} receipt{e.attachments.length > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">
                    {e.category.name}
                    {e.vendor && <> · {e.vendor}</>}
                    {" · "}{fmtDate(e.businessDate)}
                    {" · "}{t("label_confirmed_by")} {e.confirmedBy?.name}
                  </p>
                </div>
                {e.attachments.length > 0 && (
                  <div className="flex gap-1">
                    {e.attachments.slice(0, 3).map((a) => (
                      <a key={a.id} href={`/api/uploads/${a.filePath}`} target="_blank" rel="noopener noreferrer">
                        <img src={`/api/uploads/${a.filePath}`} alt="receipt"
                          className="h-10 w-10 rounded border object-cover hover:opacity-80" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
