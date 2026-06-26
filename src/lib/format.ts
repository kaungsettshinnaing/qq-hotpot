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
