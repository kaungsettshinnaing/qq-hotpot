// Display helpers.

export function formatMoney(amount: number, currency = "MMK"): string {
  const n = Math.round(amount || 0).toLocaleString("en-US");
  return `${n} ${currency}`;
}

export function formatNumber(n: number): string {
  return Math.round(n || 0).toLocaleString("en-US");
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const day = date.getDate().toString().padStart(2, "0");
  const month = MONTHS[date.getMonth()];
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

export function formatDateTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const day = date.getDate().toString().padStart(2, "0");
  const month = MONTHS[date.getMonth()];
  const year = date.getFullYear();
  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${day}-${month}-${year} ${time}`;
}

export function formatTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** Date → "YYYY-MM-DD" in server-local time, for <input type="date"> defaultValue.
 *  Uses local parts (not toISOString) so a date stored as local midnight
 *  round-trips to the same calendar day instead of shifting a day back. */
export function toInputDate(d: Date | null | undefined): string {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const MONTH_MAP: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

export function parseInputDate(s: string | null | undefined): Date | null {
  if (!s || !s.trim()) return null;
  const trimmed = s.trim();

  // Native <input type="date"> always submits ISO "YYYY-MM-DD" regardless of locale.
  // Built as UTC midnight (not server-local) so the calendar date doesn't shift
  // when the server runs in a non-UTC TZ — matches mmDateUTC() in business-day.ts.
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) {
    const [, year, month, day] = iso;
    return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
  }

  const parts = trimmed.split("-");
  if (parts.length !== 3) return null;
  const [day, mon, year] = parts;
  const m = MONTH_MAP[mon];
  if (m === undefined || !day || !year) return null;
  return new Date(Date.UTC(parseInt(year), m, parseInt(day)));
}
