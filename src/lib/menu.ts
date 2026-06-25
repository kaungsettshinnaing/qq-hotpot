import { prisma } from "./db";
import type { MenuPrices } from "./pricing";

export async function getMenuPrices(): Promise<MenuPrices> {
  const items = await prisma.menuItem.findMany();
  const m = new Map(items.map((i) => [i.code, i.price]));
  return {
    ADULT: m.get("ADULT") ?? 0,
    CHILD: m.get("CHILD") ?? 0,
    BEER: m.get("BEER") ?? 0,
    POT_ADDON: m.get("POT_ADDON") ?? 0,
    WASTAGE: m.get("WASTAGE") ?? 0,
  };
}
