import { getT } from "@/lib/lang";
import { tKey } from "@/lib/i18n";

/** Renders the banner for a `?error=<code>` redirect. Every server action that bounces
 *  back with an error code needs the page to show it — several pages never did, so the
 *  user saw nothing happen and tapped again (which is how duplicate entries start).
 *  Unknown codes render nothing; add a `error_code_<code>` key (hyphens → underscores)
 *  to i18n.ts for a new one. */
export default async function ErrorBanner({ code }: { code?: string | string[] | null }) {
  const raw = Array.isArray(code) ? code[0] : code;
  if (!raw) return null;
  const key = `error_code_${raw.replace(/-/g, "_")}`;
  // tKey falls back to the key itself when it is unknown — treat that as "no banner".
  if (tKey(key, "en") === key) return null;
  const t = await getT();
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {t(key)}
    </div>
  );
}
