import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireAnyRole } from "@/lib/auth";
import { mmDayRange, mmDayOf, mmStamp } from "@/lib/business-day";
import { getPLReport } from "@/lib/pl-report";

export const dynamic = "force-dynamic";

const MONEY = "#,##0";

function dayStr(d: Date): string {
  return mmDayOf(d).toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  await requireAnyRole(["ADMIN"]);
  const { searchParams } = new URL(req.url);
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");
  if (!fromStr || !toStr) return new NextResponse("Missing from/to", { status: 400 });

  const rangeStart = mmDayRange(fromStr).start;
  const rangeEnd = mmDayRange(toStr).end;
  const pl = await getPLReport(rangeStart, rangeEnd);

  const workbook = new ExcelJS.Workbook();

  // ── Summary ───────────────────────────────────────────────────────────────
  const summary = workbook.addWorksheet("Summary");
  summary.columns = [
    { header: "", key: "label", width: 34 },
    { header: "", key: "value", width: 18, style: { numFmt: MONEY } },
    { header: "", key: "note", width: 24 },
  ];
  const title = summary.addRow({ label: "Profit & Loss", value: `${fromStr} to ${toStr}` });
  title.font = { bold: true, size: 14 };
  title.getCell("value").numFmt = "@";
  summary.addRow({});

  const revenueHeader = summary.addRow({ label: "REVENUE" });
  revenueHeader.font = { bold: true };
  summary.addRow({ label: "Cash sales (net of change)", value: pl.revenue.cash });
  summary.addRow({ label: "KBZPay", value: pl.revenue.kbz });
  summary.addRow({ label: "Other", value: pl.revenue.other });
  summary.addRow({ label: "Total revenue", value: pl.totalRevenue }).font = { bold: true };
  summary.addRow({});

  const expenseHeader = summary.addRow({ label: "EXPENSES" });
  expenseHeader.font = { bold: true };
  for (const cat of [...pl.expensesByCategory.values()].sort(
    (a, b) => (b.confirmed + b.accrual) - (a.confirmed + a.accrual),
  )) {
    summary.addRow({
      label: cat.name,
      value: cat.confirmed + cat.accrual,
      note: cat.accrual > 0 ? `incl. ${cat.accrual.toLocaleString("en-US")} accrual` : "",
    });
  }
  summary.addRow({ label: "Total expenses", value: pl.totalExpenses }).font = { bold: true };
  summary.addRow({});

  const netRow = summary.addRow({ label: "NET P&L", value: pl.netPL });
  netRow.font = { bold: true, size: 12 };
  summary.addRow({});
  summary.addRow({ label: "Sessions closed in range", value: pl.sessions.length, note: "" })
    .getCell("value").numFmt = "0";
  summary.addRow({ label: "Diners (adult / child)", value: `${pl.totalAdults} / ${pl.totalChildren}` })
    .getCell("value").numFmt = "@";
  summary.addRow({ label: "Expense entries in range", value: pl.expenses.length })
    .getCell("value").numFmt = "0";

  // ── Revenue: one row per closed session ───────────────────────────────────
  const sessionSheet = workbook.addWorksheet("Revenue - Sessions");
  sessionSheet.columns = [
    { header: "Closed Date", key: "day", width: 14 },
    { header: "Table", key: "table", width: 16 },
    { header: "Opened", key: "opened", width: 18 },
    { header: "Closed", key: "closed", width: 18 },
    { header: "Adults", key: "adults", width: 9, style: { numFmt: "0" } },
    { header: "Children", key: "children", width: 10, style: { numFmt: "0" } },
    { header: "Subtotal", key: "subtotal", width: 14, style: { numFmt: MONEY } },
    { header: "Discount", key: "discount", width: 14, style: { numFmt: MONEY } },
    { header: "Service Charge", key: "service", width: 15, style: { numFmt: MONEY } },
    { header: "Tax", key: "tax", width: 14, style: { numFmt: MONEY } },
    { header: "Bill Total", key: "total", width: 14, style: { numFmt: MONEY } },
    { header: "Cash (net)", key: "cash", width: 14, style: { numFmt: MONEY } },
    { header: "KBZPay", key: "kbz", width: 14, style: { numFmt: MONEY } },
    { header: "Other", key: "other", width: 14, style: { numFmt: MONEY } },
    { header: "Change Given", key: "change", width: 14, style: { numFmt: MONEY } },
    { header: "Session ID", key: "id", width: 28 },
  ];
  sessionSheet.getRow(1).font = { bold: true };
  sessionSheet.views = [{ state: "frozen", ySplit: 1 }];

  for (const s of pl.sessions) {
    sessionSheet.addRow({
      day: s.closedAt ? dayStr(s.closedAt) : "",
      table: s.tableLabel,
      opened: mmStamp(s.openedAt),
      closed: s.closedAt ? mmStamp(s.closedAt) : "",
      adults: s.adults,
      children: s.children,
      subtotal: s.subtotal,
      discount: s.discount,
      service: s.serviceCharge,
      tax: s.tax,
      total: s.total,
      cash: s.cash,
      kbz: s.kbz,
      other: s.other,
      change: s.change,
      id: s.id,
    });
  }
  const sessionTotal = sessionSheet.addRow({
    day: "TOTAL",
    adults: pl.totalAdults,
    children: pl.totalChildren,
    subtotal: pl.sessions.reduce((n, s) => n + s.subtotal, 0),
    discount: pl.sessions.reduce((n, s) => n + s.discount, 0),
    service: pl.sessions.reduce((n, s) => n + s.serviceCharge, 0),
    tax: pl.sessions.reduce((n, s) => n + s.tax, 0),
    total: pl.sessionsRevenue,
    cash: pl.revenue.cash,
    kbz: pl.revenue.kbz,
    other: pl.revenue.other,
    change: pl.sessions.reduce((n, s) => n + s.change, 0),
  });
  sessionTotal.font = { bold: true };

  // ── Revenue: one row per bill line (the finest revenue grain there is) ────
  const lineSheet = workbook.addWorksheet("Revenue - Bill Lines");
  lineSheet.columns = [
    { header: "Closed Date", key: "day", width: 14 },
    { header: "Table", key: "table", width: 16 },
    { header: "Closed", key: "closed", width: 18 },
    { header: "Item", key: "item", width: 28 },
    { header: "Qty", key: "qty", width: 10, style: { numFmt: "0" } },
    { header: "Unit", key: "unit", width: 10 },
    { header: "Unit Price", key: "unitPrice", width: 14, style: { numFmt: MONEY } },
    { header: "Amount", key: "amount", width: 14, style: { numFmt: MONEY } },
    { header: "Session ID", key: "id", width: 28 },
  ];
  lineSheet.getRow(1).font = { bold: true };
  lineSheet.views = [{ state: "frozen", ySplit: 1 }];

  let lineTotalAmount = 0;
  for (const s of pl.sessions) {
    for (const l of s.lines) {
      lineTotalAmount += l.amount;
      lineSheet.addRow({
        day: s.closedAt ? dayStr(s.closedAt) : "",
        table: s.tableLabel,
        closed: s.closedAt ? mmStamp(s.closedAt) : "",
        item: l.label,
        qty: l.qty,
        unit: l.unitLabel,
        unitPrice: l.unitPrice,
        amount: l.amount,
        id: s.id,
      });
    }
  }
  // Line total is the pre-discount subtotal across sessions — it will not equal
  // Bill Total on the Sessions sheet whenever a discount, service charge or tax
  // applies. Labelled so nobody reads it as a revenue figure.
  lineSheet.addRow({ day: "TOTAL (subtotal, before discount/service/tax)", amount: lineTotalAmount })
    .font = { bold: true };

  // ── Revenue: aggregated by menu item ──────────────────────────────────────
  const itemSheet = workbook.addWorksheet("Revenue - By Item");
  itemSheet.columns = [
    { header: "Item", key: "item", width: 32 },
    { header: "Qty", key: "qty", width: 12, style: { numFmt: "0" } },
    { header: "Amount", key: "amount", width: 16, style: { numFmt: MONEY } },
  ];
  itemSheet.getRow(1).font = { bold: true };
  for (const row of [...pl.incomeByItem.values()].sort((a, b) => b.amount - a.amount)) {
    itemSheet.addRow({ item: row.label, qty: row.qty, amount: row.amount });
  }
  itemSheet.addRow({
    item: "TOTAL",
    amount: [...pl.incomeByItem.values()].reduce((n, r) => n + r.amount, 0),
  }).font = { bold: true };

  // ── Expenses: one row per expense entry ───────────────────────────────────
  const expenseSheet = workbook.addWorksheet("Expenses");
  expenseSheet.columns = [
    { header: "Business Date", key: "day", width: 14 },
    { header: "Description", key: "description", width: 40 },
    { header: "Category", key: "category", width: 22 },
    { header: "Vendor", key: "vendor", width: 22 },
    { header: "Payment Source", key: "source", width: 16 },
    { header: "Status", key: "status", width: 12 },
    { header: "Paid At", key: "paidAt", width: 18 },
    { header: "Entered By", key: "enteredBy", width: 18 },
    { header: "Amount", key: "amount", width: 16, style: { numFmt: MONEY } },
    { header: "Expense ID", key: "id", width: 28 },
  ];
  expenseSheet.getRow(1).font = { bold: true };
  expenseSheet.views = [{ state: "frozen", ySplit: 1 }];

  for (const e of pl.expenses) {
    expenseSheet.addRow({
      day: dayStr(e.businessDate),
      description: e.description,
      category: e.categoryName,
      vendor: e.vendor ?? "",
      source: e.paymentSource === "CASH_DRAWER" ? "Cash drawer" : "Bank transfer",
      status: e.confirmedAt ? "Confirmed" : "Accrual",
      paidAt: e.paidAt ? mmStamp(e.paidAt) : "",
      enteredBy: e.enteredByName,
      amount: e.amount,
      id: e.id,
    });
  }
  expenseSheet.addRow({ day: "TOTAL", amount: pl.totalExpenses }).font = { bold: true };

  // ── Expenses: one row per invoice line, where entries have them ───────────
  const expenseLineSheet = workbook.addWorksheet("Expenses - Line Items");
  expenseLineSheet.columns = [
    { header: "Business Date", key: "day", width: 14 },
    { header: "Expense Description", key: "expense", width: 32 },
    { header: "Category", key: "category", width: 22 },
    { header: "Vendor", key: "vendor", width: 22 },
    { header: "Line Item", key: "item", width: 32 },
    { header: "Qty", key: "qty", width: 10 },
    { header: "Unit", key: "unit", width: 12 },
    { header: "Price", key: "price", width: 14, style: { numFmt: MONEY } },
    { header: "Expense ID", key: "id", width: 28 },
  ];
  expenseLineSheet.getRow(1).font = { bold: true };
  expenseLineSheet.views = [{ state: "frozen", ySplit: 1 }];

  for (const e of pl.expenses) {
    for (const l of e.lines) {
      expenseLineSheet.addRow({
        day: dayStr(e.businessDate),
        expense: e.description,
        category: e.categoryName,
        vendor: e.vendor ?? "",
        item: l.description,
        qty: l.qty,
        unit: l.unit ?? "",
        price: l.price,
        id: e.id,
      });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="pl_${fromStr}_to_${toStr}.xlsx"`,
    },
  });
}
