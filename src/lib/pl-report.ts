// Period P&L aggregation — shared by the /accounting?tab=pl view and the
// Excel export, so the numbers on screen and in the downloaded file are
// derived from exactly one code path and can never drift apart.

import { prisma } from "./db";
import { getSessionDetail } from "./orders";
import { netCashChange } from "./pricing";
import { formatDateTime } from "./format";

export interface PLBillLine {
  label: string;
  qty: number;
  unitLabel: string;
  unitPrice: number;
  amount: number;
}

/** One closed session, with its recomputed bill and its tender split. */
export interface PLSessionRow {
  id: string;
  tableLabel: string;
  adults: number;
  children: number;
  revenue: number;
  /** Formatted for MovementsTable; openedAt/closedAt keep the raw instants. */
  start: string;
  end: string;
  openedAt: Date;
  closedAt: Date | null;
  lines: PLBillLine[];
  subtotal: number;
  discount: number;
  serviceCharge: number;
  tax: number;
  total: number;
  cash: number;
  kbz: number;
  other: number;
  /** Cash handed back — already deducted from `cash`. */
  change: number;
}

export interface PLExpenseLine {
  description: string;
  unit: string | null;
  qty: number;
  price: number;
}

export interface PLExpenseRow {
  id: string;
  businessDate: Date;
  description: string;
  categoryName: string;
  vendor: string | null;
  paymentSource: "CASH_DRAWER" | "BANK_TRANSFER";
  amount: number;
  confirmedAt: Date | null;
  paidAt: Date | null;
  enteredByName: string;
  lines: PLExpenseLine[];
}

export interface PLCategoryRow {
  name: string;
  confirmed: number;
  accrual: number;
}

export interface PLReport {
  revenue: { cash: number; kbz: number; other: number };
  totalRevenue: number;
  sessions: PLSessionRow[];
  /** Sum of session bill totals — the itemized counterpart of totalRevenue. */
  sessionsRevenue: number;
  totalAdults: number;
  totalChildren: number;
  incomeByItem: Map<string, { label: string; qty: number; amount: number }>;
  expenses: PLExpenseRow[];
  expensesByCategory: Map<string, PLCategoryRow>;
  totalExpenses: number;
  netPL: number;
}

export function emptyPLReport(): PLReport {
  return {
    revenue: { cash: 0, kbz: 0, other: 0 },
    totalRevenue: 0,
    sessions: [],
    sessionsRevenue: 0,
    totalAdults: 0,
    totalChildren: 0,
    incomeByItem: new Map(),
    expenses: [],
    expensesByCategory: new Map(),
    totalExpenses: 0,
    netPL: 0,
  };
}

/**
 * Builds the P&L for [rangeStart, rangeEnd) — Myanmar day boundaries, produced
 * by mmDayRange() at the call site.
 *
 * Revenue comes entirely from sessions closed inside the range, so the headline
 * total and the itemized session list share one filter (closedAt) and can never
 * disagree the way a receivedAt-vs-closedAt mismatch would allow. Change is
 * deducted per session via netCashChange(), which credits non-cash tenders
 * against the bill first so only genuine excess cash counts as change.
 *
 * Expenses are filtered on businessDate and exclude rejected entries; both
 * confirmed and accrual (unconfirmed) amounts count toward the period total.
 */
export async function getPLReport(rangeStart: Date, rangeEnd: Date): Promise<PLReport> {
  const [expenseRecords, plSessions] = await Promise.all([
    prisma.expense.findMany({
      where: { businessDate: { gte: rangeStart, lt: rangeEnd }, rejectedAt: null },
      include: {
        category: { select: { name: true } },
        enteredBy: { select: { name: true } },
        lines: { orderBy: { sortOrder: "asc" } },
      },
      orderBy: { businessDate: "desc" },
    }),
    prisma.tableSession.findMany({
      where: { status: "CLOSED", closedAt: { gte: rangeStart, lt: rangeEnd } },
      select: {
        id: true, adults: true, children: true, billTotal: true,
        openedAt: true, closedAt: true,
        table: { select: { label: true } },
        mergedTables: { select: { table: { select: { label: true } } } },
        payments: { where: { voidedAt: null }, select: { method: true, amount: true } },
      },
      orderBy: { closedAt: "asc" },
    }),
  ]);

  // Bill line items aren't stored, so each session's bill is recomputed.
  const sessions: PLSessionRow[] = await Promise.all(
    plSessions.map(async (s) => {
      const bill = (await getSessionDetail(s.id))?.bill ?? null;
      const billTotal = s.billTotal ?? s.payments.reduce((sum, p) => sum + p.amount, 0);
      const cashPaid = s.payments.filter((p) => p.method === "CASH").reduce((sum, p) => sum + p.amount, 0);
      const change = netCashChange(s.payments, billTotal);
      return {
        id: s.id,
        tableLabel: [s.table.label, ...s.mergedTables.map((m) => m.table.label)].join(" + "),
        adults: s.adults,
        children: s.children,
        revenue: s.billTotal ?? bill?.total ?? 0,
        start: formatDateTime(s.openedAt),
        end: s.closedAt ? formatDateTime(s.closedAt) : "—",
        openedAt: s.openedAt,
        closedAt: s.closedAt,
        lines: (bill?.lines ?? []).map((l) => ({
          label: l.label, qty: l.qty, unitLabel: l.unitLabel, unitPrice: l.unitPrice, amount: l.amount,
        })),
        subtotal: bill?.subtotal ?? 0,
        discount: bill?.discount ?? 0,
        serviceCharge: bill?.serviceCharge ?? 0,
        tax: bill?.tax ?? 0,
        total: bill?.total ?? (s.billTotal ?? 0),
        cash: cashPaid - change,
        kbz: s.payments.filter((p) => p.method === "KBZPAY").reduce((sum, p) => sum + p.amount, 0),
        other: s.payments.filter((p) => p.method === "OTHER").reduce((sum, p) => sum + p.amount, 0),
        change,
      };
    }),
  );

  const revenue = sessions.reduce(
    (acc, s) => ({ cash: acc.cash + s.cash, kbz: acc.kbz + s.kbz, other: acc.other + s.other }),
    { cash: 0, kbz: 0, other: 0 },
  );
  const totalRevenue = revenue.cash + revenue.kbz + revenue.other;

  const incomeByItem = new Map<string, { label: string; qty: number; amount: number }>();
  for (const s of sessions) {
    for (const l of s.lines) {
      const row = incomeByItem.get(l.label) ?? { label: l.label, qty: 0, amount: 0 };
      row.qty += l.qty;
      row.amount += l.amount;
      incomeByItem.set(l.label, row);
    }
  }

  const expenses: PLExpenseRow[] = expenseRecords.map((e) => ({
    id: e.id,
    businessDate: e.businessDate,
    description: e.description,
    categoryName: e.category.name,
    vendor: e.vendor,
    paymentSource: e.paymentSource,
    amount: e.amount,
    confirmedAt: e.confirmedAt,
    paidAt: e.paidAt,
    enteredByName: e.enteredBy.name,
    lines: e.lines.map((l) => ({
      description: l.description, unit: l.unit, qty: l.qty, price: l.price,
    })),
  }));

  const expensesByCategory = new Map<string, PLCategoryRow>();
  for (const e of expenseRecords) {
    const row = expensesByCategory.get(e.categoryId) ?? { name: e.category.name, confirmed: 0, accrual: 0 };
    if (e.confirmedAt) row.confirmed += e.amount;
    else row.accrual += e.amount;
    expensesByCategory.set(e.categoryId, row);
  }

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

  return {
    revenue,
    totalRevenue,
    sessions,
    sessionsRevenue: sessions.reduce((s, r) => s + r.revenue, 0),
    totalAdults: sessions.reduce((s, r) => s + r.adults, 0),
    totalChildren: sessions.reduce((s, r) => s + r.children, 0),
    incomeByItem,
    expenses,
    expensesByCategory,
    totalExpenses,
    netPL: totalRevenue - totalExpenses,
  };
}
