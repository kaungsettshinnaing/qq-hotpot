// Table status derivation (pure helpers).

export type TableStatus = "AVAILABLE" | "OCCUPIED" | "BLOCKED" | "MERGED";

/**
 * Whether a reservation currently blocks walk-in seating of its table.
 * Blocked window = [bookingAt - blockMins, bookingAt + durationMin].
 */
export function reservationBlocksNow(
  bookingAt: Date,
  durationMin: number,
  blockMins: number,
  now: Date = new Date(),
): boolean {
  const start = new Date(bookingAt.getTime() - blockMins * 60000);
  const end = new Date(bookingAt.getTime() + durationMin * 60000);
  return now >= start && now <= end;
}

export const STATUS_STYLES: Record<TableStatus, string> = {
  AVAILABLE: "bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100",
  OCCUPIED: "bg-red-50 border-red-300 text-red-800 hover:bg-red-100",
  BLOCKED: "bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100",
  MERGED:   "bg-violet-50 border-violet-300 text-violet-800 hover:bg-violet-100",
};

export const STATUS_LABEL: Record<TableStatus, string> = {
  AVAILABLE: "Available",
  OCCUPIED: "Occupied",
  BLOCKED: "Reserved",
  MERGED: "Merged",
};
