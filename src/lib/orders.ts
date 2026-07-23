import { prisma } from "./db";
import { getMenuPrices } from "./menu";
import { getSettings } from "./settings";
import {
  computeBill,
  freePotsAllowed,
  type DiscountType,
} from "./pricing";

/** Loads an open/closed session with pots, beer, payments and a computed bill. */
export async function getSessionDetail(sessionId: string) {
  const session = await prisma.tableSession.findUnique({
    where: { id: sessionId },
    include: {
      table: { include: { area: true } },
      mergedTables: { include: { table: { select: { label: true } } }, orderBy: { id: "asc" } },
      openedBy: { select: { id: true, name: true } },
      potOrders: {
        where: { voidedAt: null },
        include: { flavours: { include: { flavour: true } } },
        orderBy: { createdAt: "asc" },
      },
      orderItems: { where: { voidedAt: null } },
      payments: { where: { voidedAt: null }, orderBy: { receivedAt: "asc" } },
    },
  });
  if (!session) return null;

  const [prices, settings, allMenuItems] = await Promise.all([
    getMenuPrices(),
    getSettings(),
    prisma.menuItem.findMany({ select: { code: true, name: true } }),
  ]);
  const itemNameMap = new Map(allMenuItems.map((m) => [m.code, m.name]));

  const diners = session.adults + session.children;
  const totalPots = session.potOrders.length;
  const allowance = freePotsAllowed(diners, settings.freePotRatio, settings.freePotRounding);
  const freePots = Math.min(totalPots, allowance);
  const paidPots = Math.max(0, totalPots - allowance);

  const SYSTEM_CODES = new Set(["ADULT", "CHILD", "BEER", "POT_ADDON", "WASTAGE"]);
  const beerQty = session.orderItems
    .filter((o) => o.itemCode === "BEER")
    .reduce((s, o) => s + o.qty, 0);
  const extraItems = session.orderItems
    .filter((o) => !SYSTEM_CODES.has(o.itemCode) && o.qty > 0)
    .map((o) => ({
      code: o.itemCode,
      label: itemNameMap.get(o.itemCode) ?? o.itemCode,
      qty: o.qty,
      unitPrice: o.unitPrice,
    }));

  const bill = computeBill({
    adults: session.adults,
    children: session.children,
    wastageGrams: session.wastageGrams,
    beerQty,
    paidPots,
    extraItems,
    discountType: (session.discountType as DiscountType | null) ?? null,
    discountValue: session.discountValue,
    prices,
    taxEnabled: settings.taxEnabled,
    taxRatePct: settings.taxRatePct,
    serviceEnabled: settings.serviceEnabled,
    serviceRatePct: settings.serviceRatePct,
  });

  const paid = session.payments.reduce((s, p) => s + p.amount, 0);

  return {
    session,
    prices,
    settings,
    diners,
    totalPots,
    allowance,
    freePots,
    paidPots,
    beerQty,
    bill,
    paid,
    balance: bill.total - paid,
  };
}

export type SessionDetail = NonNullable<Awaited<ReturnType<typeof getSessionDetail>>>;
