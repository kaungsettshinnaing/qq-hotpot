import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import SubmitButton from "@/components/SubmitButton";
import { openTable } from "../../actions";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

export default async function OpenTablePage({
  params,
}: {
  params: Promise<{ tableId: string }>;
}) {
  await requireAnyRole(["WAITER", "MANAGER", "ADMIN"]);
  const t = await getT();
  const { tableId } = await params;

  const table = await prisma.table.findUnique({ where: { id: tableId }, include: { area: true } });
  if (!table) redirect("/waiter");

  const open = await prisma.tableSession.findFirst({ where: { tableId, status: "OPEN" } });
  if (open) redirect(`/waiter/session/${open.id}`);

  const action = openTable.bind(null, tableId);

  return (
    <div className="mx-auto max-w-sm">
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
