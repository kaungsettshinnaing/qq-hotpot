// Myanmar (UTC+6:30) business-day helpers.
// Every "what day is it / which instants does this day cover" computation must
// go through here so query boundaries never depend on the server's TZ setting.

const MM_OFFSET_MS = (6 * 60 + 30) * 60 * 1000;

/** Today's date in Myanmar as "YYYY-MM-DD". */
export function mmToday(): string {
  return new Date(Date.now() + MM_OFFSET_MS).toISOString().slice(0, 10);
}

/** Current moment shifted by +6:30 — read Myanmar wall-clock parts with getUTC*(). */
export function mmNow(): Date {
  return new Date(Date.now() + MM_OFFSET_MS);
}

/** [start, end) instants covering one Myanmar calendar day, for timestamp columns. */
export function mmDayRange(dayStr: string): { start: Date; end: Date } {
  const start = new Date(`${dayStr}T00:00:00+06:30`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

/** UTC-midnight Date for "YYYY-MM-DD" — the storage convention for DATE-like
 *  columns (Attendance.date, StockCount.date, DailyReport grouping). */
export function mmDateUTC(dayStr: string): Date {
  const [y, m, d] = dayStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** UTC-midnight Date of the Myanmar calendar day containing the given instant.
 *  Safe for instants stored as UTC midnight, Yangon midnight, or any timestamp. */
export function mmDayOf(instant: Date): Date {
  const shifted = new Date(instant.getTime() + MM_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}

/** Today as a UTC-midnight Date (storage convention for DATE-like columns). */
export function mmTodayUTC(): Date {
  return mmDayOf(new Date());
}
