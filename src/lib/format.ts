// Display helpers.

export function formatMoney(amount: number, currency = "MMK"): string {
  const n = Math.round(amount || 0).toLocaleString("en-US");
  return `${n} ${currency}`;
}

export function formatNumber(n: number): string {
  return Math.round(n || 0).toLocaleString("en-US");
}

export function formatDateTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
