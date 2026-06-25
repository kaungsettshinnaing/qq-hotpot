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

export interface BillInput {
  adults: number;
  children: number;
  wastageGrams: number;
  beerQty: number;
  paidPots: number;
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
