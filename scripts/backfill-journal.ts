/**
 * One-time backfill: walks every pre-existing historical record through the
 * same post*() functions used going forward, so the journal covers the
 * business's full history rather than only starting from when this feature
 * shipped. Safe to re-run — postEntry() is idempotent on (sourceType, sourceId).
 *
 * Run with: npx tsx scripts/backfill-journal.ts
 */
import { prisma } from "../src/lib/db";
import { getSessionDetail } from "../src/lib/orders";
import {
  postSessionClose,
  postArReconciled,
  postExpenseEntry,
  postApPaid,
  postCashMovement,
  postAdvanceGiven,
  postPayrollItem,
} from "../src/lib/journal-postings";

async function main() {
  let posted = 0;

  // 1. Closed table sessions — revenue
  const sessions = await prisma.tableSession.findMany({
    where: { status: "CLOSED", billTotal: { not: null } },
    select: { id: true, closedAt: true, table: { select: { label: true } } },
    orderBy: { closedAt: "asc" },
  });
  for (const s of sessions) {
    const detail = await getSessionDetail(s.id);
    if (!detail || !s.closedAt) continue;
    await postSessionClose(
      prisma,
      { id: s.id, closedAt: s.closedAt, tableLabel: s.table.label },
      detail.bill,
      detail.session.payments,
    );
    posted++;
  }
  console.log(`Posted ${sessions.length} session-close entries.`);

  // 2. AR reconciliations (KBZPay/Other payments marked received)
  const reconciled = await prisma.payment.findMany({
    where: { reconciledAt: { not: null }, voidedAt: null },
    select: { id: true, amount: true, reconciledAt: true },
  });
  for (const p of reconciled) {
    if (!p.reconciledAt) continue;
    await postArReconciled(prisma, { id: p.id, amount: p.amount, reconciledAt: p.reconciledAt });
  }
  console.log(`Posted ${reconciled.length} AR-reconciliation entries.`);

  // 3. Expense entries (accrual — every non-rejected expense, regardless of confirm/pay state)
  const expenses = await prisma.expense.findMany({
    where: { rejectedAt: null },
    select: { id: true, amount: true, businessDate: true, description: true, categoryId: true, paymentSource: true },
  });
  for (const e of expenses) {
    await postExpenseEntry(prisma, e);
  }
  console.log(`Posted ${expenses.length} expense entries.`);

  // 4. AP payments
  const paidExpenses = await prisma.expense.findMany({
    where: { paidAt: { not: null }, rejectedAt: null },
    select: { id: true, amount: true, paidAt: true },
  });
  for (const e of paidExpenses) {
    if (!e.paidAt) continue;
    await postApPaid(prisma, { id: e.id, amount: e.amount, paidAt: e.paidAt });
  }
  console.log(`Posted ${paidExpenses.length} AP-payment entries.`);

  // 5. Manual cash movements
  const movements = await prisma.cashCollection.findMany({
    select: { id: true, type: true, amount: true, createdAt: true },
  });
  for (const m of movements) {
    await postCashMovement(prisma, m);
  }
  console.log(`Posted ${movements.length} cash-movement entries.`);

  // 6. Salary advances given
  const advances = await prisma.salaryAdvance.findMany({
    select: { id: true, totalAmount: true, createdAt: true },
  });
  for (const a of advances) {
    await postAdvanceGiven(prisma, a);
  }
  console.log(`Posted ${advances.length} salary-advance entries.`);

  // 7. Locked payroll items
  const lockedPayrolls = await prisma.payroll.findMany({
    where: { status: "LOCKED" },
    select: { lockedAt: true, items: { select: { id: true, netPay: true, advanceDeduction: true, fineDeduction: true } } },
  });
  let payrollItemCount = 0;
  for (const payroll of lockedPayrolls) {
    if (!payroll.lockedAt) continue;
    for (const item of payroll.items) {
      await postPayrollItem(prisma, item, payroll.lockedAt);
      payrollItemCount++;
    }
  }
  console.log(`Posted ${payrollItemCount} payroll-item entries.`);

  // Sanity check — the whole ledger must balance.
  const totals = await prisma.journalLine.aggregate({ _sum: { debit: true, credit: true } });
  const totalDebit = totals._sum.debit ?? 0;
  const totalCredit = totals._sum.credit ?? 0;
  console.log(`\nTotal debit: ${totalDebit}  Total credit: ${totalCredit}  Balanced: ${totalDebit === totalCredit}`);
  if (totalDebit !== totalCredit) {
    throw new Error("Journal is unbalanced after backfill — investigate before trusting these figures.");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
