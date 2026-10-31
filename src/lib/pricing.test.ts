import { describe, expect, it } from "vitest";
import {
  buffetPrices, computeBill, specialBuffetOffered, SYSTEM_CODES,
  type BillInput, type MenuPrices,
} from "./pricing";

// Prod menu, 31 Oct 2026.
const prices: MenuPrices = {
  ADULT: 23000, CHILD: 10000, SPECIAL_ADULT: 29000, SPECIAL_CHILD: 15000,
  BEER: 10000, POT_ADDON: 5000, WASTAGE: 50,
};

function bill(over: Partial<BillInput> = {}) {
  return computeBill({
    adults: 2, children: 1, wastageGrams: 0, beerQty: 0, paidPots: 0,
    discountType: null, discountValue: null, prices,
    taxEnabled: false, taxRatePct: 0, serviceEnabled: false, serviceRatePct: 0,
    ...over,
  });
}

describe("buffet type on the bill", () => {
  it("bills the normal buffet when no type is given (tables opened before buffet types)", () => {
    const b = bill();
    expect(b.lines.map((l) => l.code)).toEqual(["ADULT", "CHILD"]);
    expect(b.total).toBe(2 * 23000 + 10000);
  });

  it("bills normal prices for a NORMAL table", () => {
    expect(bill({ buffetType: "NORMAL" }).total).toBe(56000);
  });

  it("replaces the normal prices with the special ones for a SPECIAL table", () => {
    const b = bill({ buffetType: "SPECIAL", paidPots: 1, beerQty: 1, wastageGrams: 100 });
    expect(b.lines.map((l) => [l.code, l.qty, l.amount])).toEqual([
      ["SPECIAL_ADULT", 2, 58000],
      ["SPECIAL_CHILD", 1, 15000],
      ["POT_ADDON", 1, 5000],
      ["BEER", 1, 10000],
      ["WASTAGE", 100, 5000],
    ]);
    expect(b.lines.some((l) => l.code === "ADULT" || l.code === "CHILD")).toBe(false);
    expect(b.total).toBe(93000);
  });

  it("applies discount, service and tax on the special subtotal", () => {
    const b = bill({
      buffetType: "SPECIAL", discountType: "PERCENT", discountValue: 10,
      serviceEnabled: true, serviceRatePct: 5,
    });
    // subtotal 73,000 → −7,300 → 65,700 + 3,285 service
    expect(b.subtotal).toBe(73000);
    expect(b.discount).toBe(7300);
    expect(b.total).toBe(65700 + 3285);
  });

  it("buffetPrices picks the pair for each type", () => {
    expect(buffetPrices(prices, "NORMAL")).toEqual({ adult: 23000, child: 10000 });
    expect(buffetPrices(prices, "SPECIAL")).toEqual({ adult: 29000, child: 15000 });
  });

  it("special buffet codes are system codes (never orderable as extra items)", () => {
    expect(SYSTEM_CODES).toContain("SPECIAL_ADULT");
    expect(SYSTEM_CODES).toContain("SPECIAL_CHILD");
  });

  it("offers Special only while its adult row is shown and priced", () => {
    expect(specialBuffetOffered({ price: 29000, isActive: true })).toBe(true);
    expect(specialBuffetOffered({ price: 29000, isActive: false })).toBe(false);
    expect(specialBuffetOffered({ price: 0, isActive: true })).toBe(false);
    expect(specialBuffetOffered(null)).toBe(false);
  });
});
