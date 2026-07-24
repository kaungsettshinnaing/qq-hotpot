import { Prisma, PrismaClient } from "@prisma/client";
import { getCoreAccount, getOrCreateExpenseAccount, postEntry } from "./journal";
import { netCashChange } from "./pricing";

type Tx = Prisma.TransactionClient | PrismaClient;

/** Posted when a table session is settled (cashier checkout). */
export async function postSessionClose(
  tx: Tx,
  session: { id: string; closedAt: Date; tableLabel: string },
  bill: { subtotal: number; discount: number; serviceCharge: number; tax: number },
  payments: { method: "CASH" | "KBZPAY" | "OTHER"; amount: number }[],
): Promise<void> {
  const billTotal = bill.subtotal - bill.discount + bill.serviceCharge + bill.tax;
  const cashPaid = payments.filter((p) => p.method === "CASH").reduce((s, p) => s + p.amount, 0);
  const kbzPaid = payments.filter((p) => p.method === "KBZPAY").reduce((s, p) => s + p.amount, 0);
  const otherPaid = payments.filter((p) => p.method === "OTHER").reduce((s, p) => s + p.amount, 0);
  const netCash = cashPaid - netCashChange(payments, billTotal);

  const [cash, arWallet, discounts, revenue, serviceChargeAcct, taxPayable] = await Promise.all([
    getCoreAccount(tx, "1000"),
    getCoreAccount(tx, "1010"),
    getCoreAccount(tx, "4900"),
    getCoreAccount(tx, "4000"),
    getCoreAccount(tx, "4010"),
    getCoreAccount(tx, "2010"),
  ]);

  await postEntry(tx, {
    date: session.closedAt,
    description: `Table ${session.tableLabel} settled`,
    sourceType: "TableSession",
    sourceId: session.id,
    lines: [
      { accountId: cash, debit: netCash },
      { accountId: arWallet, debit: kbzPaid + otherPaid },
      { accountId: discounts, debit: bill.discount },
      { accountId: revenue, credit: bill.subtotal },
      { accountId: serviceChargeAcct, credit: bill.serviceCharge },
      { accountId: taxPayable, credit: bill.tax },
    ],
  });
}

/** Posted when an admin marks a KBZPay/Other payment as reconciled to the bank. */
export async function postArReconciled(
  tx: Tx,
  payment: { id: string; amount: number; reconciledAt: Date },
): Promise<void> {
  const [bank, arWallet] = await Promise.all([getCoreAccount(tx, "1020"), getCoreAccount(tx, "1010")]);
  await postEntry(tx, {
    date: payment.reconciledAt,
    description: "Digital wallet payment reconciled to bank",
    sourceType: "Payment.reconciled",
    sourceId: payment.id,
    lines: [
      { accountId: bank, debit: payment.amount },
      { accountId: arWallet, credit: payment.amount },
    ],
  });
}

/** Posted when an expense is entered (accrual basis — recognized immediately, regardless of paymentSource). */
export async function postExpenseEntry(
  tx: Tx,
  expense: { id: string; amount: number; businessDate: Date; description: string; categoryId: string; paymentSource: "CASH_DRAWER" | "BANK_TRANSFER" },
): Promise<void> {
  const [expenseAcct, cash, ap] = await Promise.all([
    getOrCreateExpenseAccount(tx, expense.categoryId),
    getCoreAccount(tx, "1000"),
    getCoreAccount(tx, "2000"),
  ]);
  await postEntry(tx, {
    date: expense.businessDate,
    description: expense.description,
    sourceType: "Expense",
    sourceId: expense.id,
    lines: [
      { accountId: expenseAcct, debit: expense.amount },
      { accountId: expense.paymentSource === "CASH_DRAWER" ? cash : ap, credit: expense.amount },
    ],
  });
}

/** Posted when an admin marks a bank-transfer expense as paid. */
export async function postApPaid(tx: Tx, expense: { id: string; amount: number; paidAt: Date }): Promise<void> {
  const [ap, bank] = await Promise.all([getCoreAccount(tx, "2000"), getCoreAccount(tx, "1020")]);
  await postEntry(tx, {
    date: expense.paidAt,
    description: "Accounts payable settled",
    sourceType: "Expense.paid",
    sourceId: expense.id,
    lines: [
      { accountId: ap, debit: expense.amount },
      { accountId: bank, credit: expense.amount },
    ],
  });
}

/** Posted for a manual cash-drawer inject/collect (not a P&L event — keeps the Cash account internally consistent). */
export async function postCashMovement(
  tx: Tx,
  movement: { id: string; type: "INJECT" | "COLLECT"; amount: number; createdAt: Date },
): Promise<void> {
  const [cash, ownerAdj] = await Promise.all([getCoreAccount(tx, "1000"), getCoreAccount(tx, "2900")]);
  await postEntry(tx, {
    date: movement.createdAt,
    description: movement.type === "INJECT" ? "Cash injected into drawer" : "Cash collected from drawer",
    sourceType: "CashCollection",
    sourceId: movement.id,
    lines: movement.type === "INJECT"
      ? [{ accountId: cash, debit: movement.amount }, { accountId: ownerAdj, credit: movement.amount }]
      : [{ accountId: ownerAdj, debit: movement.amount }, { accountId: cash, credit: movement.amount }],
  });
}

/** Posted when a salary advance is given to an employee. */
export async function postAdvanceGiven(
  tx: Tx,
  advance: { id: string; totalAmount: number; createdAt: Date },
): Promise<void> {
  const [advReceivable, cash] = await Promise.all([getCoreAccount(tx, "2100"), getCoreAccount(tx, "1000")]);
  await postEntry(tx, {
    date: advance.createdAt,
    description: "Salary advance given",
    sourceType: "SalaryAdvance",
    sourceId: advance.id,
    lines: [
      { accountId: advReceivable, debit: advance.totalAmount },
      { accountId: cash, credit: advance.totalAmount },
    ],
  });
}

/** Posted once per employee when payroll for a month is locked. */
export async function postPayrollItem(
  tx: Tx,
  item: { id: string; netPay: number; advanceDeduction: number; fineDeduction: number },
  lockedAt: Date,
): Promise<void> {
  const gross = item.netPay + item.advanceDeduction + item.fineDeduction;
  if (gross <= 0) return;
  const [wages, advReceivable, finesRecovered, bank] = await Promise.all([
    getCoreAccount(tx, "6000"),
    getCoreAccount(tx, "2100"),
    getCoreAccount(tx, "6010"),
    getCoreAccount(tx, "1020"),
  ]);
  await postEntry(tx, {
    date: lockedAt,
    description: "Payroll — salary paid",
    sourceType: "PayrollItem",
    sourceId: item.id,
    lines: [
      { accountId: wages, debit: gross },
      { accountId: advReceivable, credit: item.advanceDeduction },
      { accountId: finesRecovered, credit: item.fineDeduction },
      { accountId: bank, credit: item.netPay },
    ],
  });
}
