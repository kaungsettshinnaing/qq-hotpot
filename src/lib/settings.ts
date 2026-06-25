import { Prisma } from "@prisma/client";
import { prisma } from "./db";

export interface AppSettings {
  restaurantName: string;
  currency: string;
  freePotRatio: number; // 1 free pot per N diners
  freePotRounding: "UP" | "DOWN";
  reservationBlockMins: number; // table blocked this many minutes before booking
  taxEnabled: boolean;
  taxRatePct: number;
  serviceEnabled: boolean;
  serviceRatePct: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  restaurantName: "QQ Hotpot BBQ",
  currency: "MMK",
  freePotRatio: 4,
  freePotRounding: "UP",
  reservationBlockMins: 90,
  taxEnabled: false,
  taxRatePct: 0,
  serviceEnabled: false,
  serviceRatePct: 0,
};

export async function getSettings(): Promise<AppSettings> {
  const rows = await prisma.setting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.valueJson as unknown]));
  const num = (k: keyof AppSettings) =>
    typeof map.get(k) === "number" ? (map.get(k) as number) : (DEFAULT_SETTINGS[k] as number);
  const bool = (k: keyof AppSettings) =>
    typeof map.get(k) === "boolean" ? (map.get(k) as boolean) : (DEFAULT_SETTINGS[k] as boolean);
  const str = (k: keyof AppSettings) =>
    typeof map.get(k) === "string" ? (map.get(k) as string) : (DEFAULT_SETTINGS[k] as string);

  return {
    restaurantName: str("restaurantName"),
    currency: str("currency"),
    freePotRatio: Math.max(1, num("freePotRatio")),
    freePotRounding: (map.get("freePotRounding") === "DOWN" ? "DOWN" : "UP"),
    reservationBlockMins: Math.max(0, num("reservationBlockMins")),
    taxEnabled: bool("taxEnabled"),
    taxRatePct: num("taxRatePct"),
    serviceEnabled: bool("serviceEnabled"),
    serviceRatePct: num("serviceRatePct"),
  };
}

export async function setSetting(key: string, value: Prisma.InputJsonValue): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    update: { valueJson: value },
    create: { key, valueJson: value },
  });
}
