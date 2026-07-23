// Pure pricing / free-pot logic. NO Prisma or Node imports — safe to import in
// client components for live bill previews.

export interface MenuPrices {
  ADULT: number;
  CHILD: number;
  BEER: number;
  POT_ADDON: number;
  WASTAGE: number; // per gram
}

export type DiscountType = "PERCENT" | "FIXED";

export interface ExtraItem {
  code: string;
  label: string;
  qty: number;
  unitPrice: number;
}

export interface BillInput {
  adults: number;
  children: number;
  wastageGrams: number;
  beerQty: number;
  paidPots: number;
  extraItems?: ExtraItem[];
  discountType: DiscountType | null;
  discountValue: number | null;
  prices: MenuPrices;
  taxEnabled: boolean;
  taxRatePct: number;
  serviceEnabled: boolean;
  serviceRatePct: number;
}

export interface BillLine {
  code: string;
  label: string;
  qty: number;
  unitLabel: string;
  unitPrice: number;
  amount: number;
}

export interface Bill {
  lines: BillLine[];
  subtotal: number;
  discount: number;
  serviceCharge: number;
  tax: number;
  total: number;
}

/**
 * How much of a session's CASH payments is actually "change" (money handed
 * back to the customer), given a mixed tender across payment methods.
 *
 * Non-cash tenders (KBZPay/Other) are credited against the bill FIRST; only
 * cash actually in excess of what's still owed after that counts as change.
 * This matters because change is always physically returned in cash
 * regardless of how the customer overpaid — if someone pays 60,000 by KBZPay
 * on a 50,000 bill and also hands over 5,000 cash, the entire 5,000 cash is
 * change (the bill was already covered by KBZPay alone), not just the
 * "combined overpayment minus cash" a naive total-based calc would give.
 * Never touches kbz/other totals — only how much of the CASH figure is
 * change versus real revenue.
 */
export function netCashChange(
  payments: { method: string; amount: number }[],
  billTotal: number,
): number {
  const cashPaid = payments.filter((p) => p.method === "CASH").reduce((s, p) => s + p.amount, 0);
  const nonCashPaid = payments.filter((p) => p.method !== "CASH").reduce((s, p) => s + p.amount, 0);
  const remainingAfterNonCash = Math.max(0, billTotal - nonCashPaid);
  return Math.max(0, cashPaid - remainingAfterNonCash);
}

/** Number of FREE pots a table is entitled to for a given headcount. */
export function freePotsAllowed(
  diners: number,
  ratio: number,
  rounding: "UP" | "DOWN",
): number {
  if (diners <= 0) return 0;
  const r = Math.max(1, ratio || 1);
  return rounding === "DOWN"
    ? Math.max(1, Math.floor(diners / r))
    : Math.ceil(diners / r);
}

/** How many of the table's pots are billable (beyond the free allowance). */
export function paidPotCount(
  totalPots: number,
  diners: number,
  ratio: number,
  rounding: "UP" | "DOWN",
): number {
  const allowed = freePotsAllowed(diners, ratio, rounding);
  return Math.max(0, totalPots - allowed);
}

export function computeBill(i: BillInput): Bill {
  const lines: BillLine[] = [];
  const add = (
    code: string,
    label: string,
    qty: number,
    unitLabel: string,
    unitPrice: number,
  ) => {
    if (qty > 0) lines.push({ code, label, qty, unitLabel, unitPrice, amount: qty * unitPrice });
  };

  add("ADULT", "Adult", i.adults, "pax", i.prices.ADULT);
  add("CHILD", "Child", i.children, "pax", i.prices.CHILD);
  add("POT_ADDON", "Extra Pot", i.paidPots, "pot", i.prices.POT_ADDON);
  add("BEER", "Beer", i.beerQty, "btl", i.prices.BEER);
  add("WASTAGE", "Wastage", i.wastageGrams, "g", i.prices.WASTAGE);
  for (const it of (i.extraItems ?? [])) {
    add(it.code, it.label, it.qty, "unit", it.unitPrice);
  }

  const subtotal = lines.reduce((s, l) => s + l.amount, 0);

  let discount = 0;
  if (i.discountType === "PERCENT" && i.discountValue) {
    const pct = Math.min(100, Math.max(0, i.discountValue));
    discount = Math.round((subtotal * pct) / 100);
  } else if (i.discountType === "FIXED" && i.discountValue) {
    discount = Math.min(subtotal, Math.max(0, i.discountValue));
  }

  const net = subtotal - discount;
  const serviceCharge = i.serviceEnabled
    ? Math.round((net * (i.serviceRatePct || 0)) / 100)
    : 0;
  const tax = i.taxEnabled
    ? Math.round(((net + serviceCharge) * (i.taxRatePct || 0)) / 100)
    : 0;
  const total = net + serviceCharge + tax;

  return { lines, subtotal, discount, serviceCharge, tax, total };
}
