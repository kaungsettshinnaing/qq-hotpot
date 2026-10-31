import { prisma } from "./db";
import { specialBuffetOffered, type MenuPrices } from "./pricing";

export async function getMenuPrices(): Promise<MenuPrices> {
  const items = await prisma.menuItem.findMany();
  const m = new Map(items.map((i) => [i.code, i.price]));
  return {
    ADULT: m.get("ADULT") ?? 0,
    CHILD: m.get("CHILD") ?? 0,
    SPECIAL_ADULT: m.get("SPECIAL_ADULT") ?? 0,
    SPECIAL_CHILD: m.get("SPECIAL_CHILD") ?? 0,
    BEER: m.get("BEER") ?? 0,
    POT_ADDON: m.get("POT_ADDON") ?? 0,
    WASTAGE: m.get("WASTAGE") ?? 0,
  };
}

/** Whether a table can be put on the Special buffet right now. */
export async function isSpecialBuffetOffered(): Promise<boolean> {
  const row = await prisma.menuItem.findUnique({
    where: { code: "SPECIAL_ADULT" },
    select: { price: true, isActive: true },
  });
  return specialBuffetOffered(row);
}
