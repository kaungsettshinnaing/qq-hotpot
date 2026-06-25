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
      openedBy: { select: { id: true, name: true } },
      potOrders: {
        where: { voidedAt: null },
        include: { flavours: { include: { flavour: true } } },
        orderBy: { createdAt: "asc" },
      },
      orderItems: { where: { voidedAt: null } },
      payments: { orderBy: { receivedAt: "asc" } },
    },
  });
  if (!session) return null;

  const [prices, settings] = await Promise.all([getMenuPrices(), getSettings()]);

  const diners = session.adults + session.children;
  const totalPots = session.potOrders.length;
  const allowance = freePotsAllowed(diners, settings.freePotRatio, settings.freePotRounding);
  const freePots = Math.min(totalPots, allowance);
  const paidPots = Math.max(0, totalPots - allowance);
  const beerQty = session.orderItems
    .filter((o) => o.itemCode === "BEER")
    .reduce((s, o) => s + o.qty, 0);

  const bill = computeBill({
    adults: session.adults,
    children: session.children,
    wastageGrams: session.wastageGrams,
    beerQty,
    paidPots,
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
