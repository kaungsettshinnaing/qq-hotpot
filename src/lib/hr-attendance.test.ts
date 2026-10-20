import { describe, expect, it } from "vitest";
import { summarizeAttendance, type AttendanceRowLite } from "./hr-attendance";

// Aug 2026: 31 days, Fridays (dow 5) on the 7th, 14th, 21st, 28th.
const Y = 2026;
const M = 8;
const day = (d: number) => new Date(Date.UTC(Y, M - 1, d));
const row = (d: number, status: AttendanceRowLite["status"], dayType: "FULL" | "HALF" = "FULL"): AttendanceRowLite =>
  ({ date: day(d), status, dayType });
const allPresent = (restDays: number[]) =>
  Array.from({ length: 31 }, (_, i) => i + 1)
    .filter((d) => !restDays.includes(day(d).getUTCDay()))
    .map((d) => row(d, "PRESENT"));

describe("summarizeAttendance", () => {
  it("counts 27 working days for a Friday rest day and no absence when every day is present", () => {
    const s = summarizeAttendance(allPresent([5]), Y, M, [5]);
    expect(s).toEqual({ workingDays: 27, absentDays: 0, otDays: 0 });
  });

  it("treats a working day with no row as absent (present-basis)", () => {
    const rows = allPresent([5]).filter((r) => r.date.getUTCDate() !== 3);
    expect(summarizeAttendance(rows, Y, M, [5]).absentDays).toBe(1);
  });

  it("counts OT worked on a scheduled rest day — the documented OT case", () => {
    // 7 Aug 2026 is a Friday = rest day. OT there must earn the premium.
    const rows = [...allPresent([5]), row(7, "OT")];
    const s = summarizeAttendance(rows, Y, M, [5]);
    expect(s.workingDays).toBe(27); // the rest day is still not a working day
    expect(s.absentDays).toBe(0);
    expect(s.otDays).toBe(1);
  });

  it("counts a half OT day on a rest day as 0.5", () => {
    const rows = [...allPresent([5]), row(14, "OT", "HALF")];
    expect(summarizeAttendance(rows, Y, M, [5]).otDays).toBe(0.5);
  });

  it("ignores a plain PRESENT or REST_DAY row on a rest day (no pay change)", () => {
    const rows = [...allPresent([5]), row(21, "PRESENT"), row(28, "REST_DAY")];
    expect(summarizeAttendance(rows, Y, M, [5])).toEqual({ workingDays: 27, absentDays: 0, otDays: 0 });
  });

  it("deducts half a day for a HALF present day and a full day for LEAVE", () => {
    const rows = allPresent([5]).map((r) =>
      r.date.getUTCDate() === 4 ? row(4, "PRESENT", "HALF") : r.date.getUTCDate() === 5 ? row(5, "LEAVE") : r,
    );
    expect(summarizeAttendance(rows, Y, M, [5]).absentDays).toBe(1.5);
  });
});
