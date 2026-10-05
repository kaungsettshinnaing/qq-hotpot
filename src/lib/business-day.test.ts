import { describe, expect, it } from "vitest";
import { dayOr, isDayStr, mmDayRange } from "./business-day";

describe("isDayStr / dayOr — dates taken from the URL", () => {
  it("accepts a real calendar day", () => {
    expect(isDayStr("2026-10-05")).toBe(true);
    expect(isDayStr("2024-02-29")).toBe(true);
  });

  it("rejects empty, malformed and impossible days", () => {
    for (const bad of ["", "2026-10", "05-10-2026", "2026-13-01", "2026-02-31", "2026-10-5", "abc", null, undefined]) {
      expect(isDayStr(bad)).toBe(false);
    }
  });

  it("falls back for a cleared date field (?from=) instead of yielding an Invalid Date", () => {
    expect(dayOr("", "2026-10-01")).toBe("2026-10-01");
    expect(dayOr(undefined, "2026-10-01")).toBe("2026-10-01");
    expect(dayOr("2026-09-15", "2026-10-01")).toBe("2026-09-15");
  });

  it("a fallback-resolved day always produces a valid Myanmar day range", () => {
    const { start, end } = mmDayRange(dayOr("", "2026-10-01"));
    expect(Number.isNaN(start.getTime())).toBe(false);
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
    // Myanmar midnight is 17:30 UTC the previous day
    expect(start.toISOString()).toBe("2026-09-30T17:30:00.000Z");
  });
});
