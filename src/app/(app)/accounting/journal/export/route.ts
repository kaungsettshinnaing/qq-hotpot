import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { mmDayRange } from "@/lib/business-day";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await requireAnyRole(["ADMIN"]);
  const { searchParams } = new URL(req.url);
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");
  if (!fromStr || !toStr) return new NextResponse("Missing from/to", { status: 400 });

  const rangeStart = mmDayRange(fromStr).start;
  const rangeEnd = mmDayRange(toStr).end;

  const entries = await prisma.journalEntry.findMany({
    where: { date: { gte: rangeStart, lt: rangeEnd } },
    include: { lines: { include: { account: true }, orderBy: { id: "asc" } } },
    orderBy: { entryNo: "asc" },
  });

  const workbook = new ExcelJS.Workbook();

  const journalSheet = workbook.addWorksheet("General Journal");
  journalSheet.columns = [
    { header: "Entry No", key: "entryNo", width: 12 },
    { header: "Date", key: "date", width: 14 },
    { header: "Account Code", key: "code", width: 14 },
    { header: "Account Name", key: "name", width: 32 },
    { header: "Description", key: "description", width: 40 },
    { header: "Debit", key: "debit", width: 14 },
    { header: "Credit", key: "credit", width: 14 },
    { header: "Source", key: "source", width: 24 },
  ];
  journalSheet.getRow(1).font = { bold: true };

  const accountTotals = new Map<string, { code: string; name: string; debit: number; credit: number }>();
  let grandDebit = 0;
  let grandCredit = 0;

  for (const e of entries) {
    for (const l of e.lines) {
      journalSheet.addRow({
        entryNo: `JE-${String(e.entryNo).padStart(6, "0")}`,
        date: e.date.toISOString().slice(0, 10),
        code: l.account.code,
        name: l.account.name,
        description: e.description,
        debit: l.debit || "",
        credit: l.credit || "",
        source: `${e.sourceType}:${e.sourceId}`,
      });
      grandDebit += l.debit;
      grandCredit += l.credit;
      const row = accountTotals.get(l.account.id) ?? { code: l.account.code, name: l.account.name, debit: 0, credit: 0 };
      row.debit += l.debit;
      row.credit += l.credit;
      accountTotals.set(l.account.id, row);
    }
  }
  journalSheet.addRow({});
  const totalRow = journalSheet.addRow({ description: "TOTAL", debit: grandDebit, credit: grandCredit });
  totalRow.font = { bold: true };

  const tbSheet = workbook.addWorksheet("Trial Balance");
  tbSheet.columns = [
    { header: "Account Code", key: "code", width: 14 },
    { header: "Account Name", key: "name", width: 32 },
    { header: "Debit", key: "debit", width: 16 },
    { header: "Credit", key: "credit", width: 16 },
  ];
  tbSheet.getRow(1).font = { bold: true };
  for (const row of [...accountTotals.values()].sort((a, b) => a.code.localeCompare(b.code))) {
    tbSheet.addRow(row);
  }
  const tbTotalRow = tbSheet.addRow({ name: "TOTAL", debit: grandDebit, credit: grandCredit });
  tbTotalRow.font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="journal_${fromStr}_to_${toStr}.xlsx"`,
    },
  });
}
