import { cookies } from "next/headers";
import { tKey, type Lang } from "./i18n";

export type { Lang };

export async function getLang(): Promise<Lang> {
  const c = await cookies();
  return c.get("lang")?.value === "my" ? "my" : "en";
}

/**
 * Returns a translation function bound to the current user's language.
 * Usage in any async Server Component:
 *   const t = await getT();
 *   <h1>{t("heading_tables")}</h1>
 *   <p>{t("shift_handover_body", { name: "Alice", time: "9:00 AM" })}</p>
 */
export async function getT() {
  const lang = await getLang();
  return function t(key: string, vars?: Record<string, string>): string {
    return tKey(key, lang, vars);
  };
}
