import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./db";

type Tx = Prisma.TransactionClient | PrismaClient;

// ── Core accounts (fixed, seeded once) ──────────────────────────────────────
// One account per ExpenseCategory is auto-provisioned on first use (see
// getOrCreateExpenseAccount) rather than listed here.
export const CORE_ACCOUNTS = [
  { code: "1000", name: "Cash on Hand", type: "ASSET" as const },
  { code: "1010", name: "Accounts Receivable — Digital Wallet", type: "ASSET" as const },
  { code: "1020", name: "Bank Account", type: "ASSET" as const },
  { code: "2000", name: "Accounts Payable (Trade)", type: "LIABILITY" as const },
  { code: "2010", name: "Tax Payable (Commercial Tax)", type: "LIABILITY" as const },
  { code: "2900", name: "Owner / Drawer Adjustments", type: "LIABILITY" as const },
  { code: "2100", name: "Employee Advances Receivable", type: "ASSET" as const },
  { code: "4000", name: "Sales Revenue", type: "REVENUE" as const },
  { code: "4010", name: "Service Charge Income", type: "REVENUE" as const },
  { code: "4900", name: "Discounts & Allowances", type: "REVENUE" as const },
  { code: "6000", name: "Salaries & Wages Expense", type: "EXPENSE" as const },
  { code: "6010", name: "Fines & Deductions Recovered", type: "EXPENSE" as const },
] as const;

export type CoreAccountCode = (typeof CORE_ACCOUNTS)[number]["code"];

let coreAccountCache: Map<string, string> | null = null;

/** Resolves a core account code to its Account.id, seeding it on first use. */
export async function getCoreAccount(tx: Tx, code: CoreAccountCode): Promise<string> {
  if (coreAccountCache?.has(code)) return coreAccountCache.get(code)!;
  const def = CORE_ACCOUNTS.find((a) => a.code === code)!;
  const account = await tx.account.upsert({
    where: { code },
    update: {},
    create: { code: def.code, name: def.name, type: def.type },
  });
  if (!coreAccountCache) coreAccountCache = new Map();
  coreAccountCache.set(code, account.id);
  return account.id;
}

/** One expense account per ExpenseCategory, auto-provisioned (5xxx range, in category creation order). */
export async function getOrCreateExpenseAccount(tx: Tx, categoryId: string): Promise<string> {
  const existing = await tx.account.findUnique({ where: { linkedExpenseCategoryId: categoryId } });
  if (existing) return existing.id;

  const category = await tx.expenseCategory.findUniqueOrThrow({ where: { id: categoryId } });
  const count = await tx.account.count({ where: { code: { startsWith: "5" } } });
  const code = String(5000 + count * 10);
  const account = await tx.account.create({
    data: { code, name: category.name, type: "EXPENSE", linkedExpenseCategoryId: categoryId },
  });
  return account.id;
}

export interface JournalLineInput {
  accountId: string;
  debit?: number;
  credit?: number;
}

export interface PostEntryInput {
  date: Date;
  description: string;
  sourceType: string;
  sourceId: string;
  lines: JournalLineInput[];
}

/**
 * Posts a balanced double-entry journal entry. Idempotent on
 * (sourceType, sourceId) — safe to call from a retried request or the
 * backfill script without ever double-posting the same source event.
 * Throws if debits don't equal credits — that's a bug in the caller, never
 * a valid state to silently swallow.
 */
export async function postEntry(tx: Tx, input: PostEntryInput): Promise<void> {
  const lines = input.lines.filter((l) => (l.debit ?? 0) !== 0 || (l.credit ?? 0) !== 0);
  if (lines.length === 0) return; // nothing to post (e.g. a zero-amount event)

  const totalDebit = lines.reduce((s, l) => s + (l.debit ?? 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit ?? 0), 0);
  if (totalDebit !== totalCredit) {
    throw new Error(
      `Unbalanced journal entry for ${input.sourceType}:${input.sourceId} — debit ${totalDebit} != credit ${totalCredit}`,
    );
  }

  const existing = await tx.journalEntry.findUnique({
    where: { sourceType_sourceId: { sourceType: input.sourceType, sourceId: input.sourceId } },
  });
  if (existing) return; // already posted — idempotent no-op

  await tx.journalEntry.create({
    data: {
      date: input.date,
      description: input.description,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      lines: { create: lines.map((l) => ({ accountId: l.accountId, debit: l.debit ?? 0, credit: l.credit ?? 0 })) },
    },
  });
}

/** Convenience wrapper for call sites that aren't already inside a $transaction. */
export async function postEntryStandalone(input: PostEntryInput): Promise<void> {
  await postEntry(prisma, input);
}
