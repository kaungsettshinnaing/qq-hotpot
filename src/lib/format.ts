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

const MONTH_MAP: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

export function parseInputDate(s: string | null | undefined): Date | null {
  if (!s || !s.trim()) return null;
  const parts = s.trim().split("-");
  if (parts.length !== 3) return null;
  const [day, mon, year] = parts;
  const m = MONTH_MAP[mon];
  if (m === undefined || !day || !year) return null;
  return new Date(parseInt(year), m, parseInt(day));
}
