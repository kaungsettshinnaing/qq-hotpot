import { cookies } from "next/headers";
import { tKey, type Lang } from "./i18n";

export type { Lang };

export async function getLang(): Promise<Lang> {
  const c = await cookies();
  return c.get("lang")?.value === "my" ? "my" : "en";
}

export async function getT(): Promise<(key: string) => string> {
  const lang = await getLang();
  return (key: string) => tKey(key, lang);
}
