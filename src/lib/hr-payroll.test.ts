import { describe, expect, it } from "vitest";
import {
  allocateDeductions,
  belongsOnPayslip,
  computePayrollItem,
  workingDaysInMonth,
  type ScheduledDeduction,
} from "./hr-payroll";

// ---------------------------------------------------------------------------
// workingDaysInMonth
// ---------------------------------------------------------------------------

describe("workingDaysInMonth", () => {
  it("excludes the employee's rest weekday", () => {
    // Aug 2026 has 31 days and 4 Fridays (dow 5) — matches the 27 working
    // days on the live Aug 2026 payroll for staff resting on Fridays.
    expect(workingDaysInMonth(2026, 8, [5])).toBe(27);
  });

  it("counts every day when the employee has no rest day", () => {
    expect(workingDaysInMonth(2026, 8, [])).toBe(31);
  });
});

// ---------------------------------------------------------------------------
// computePayrollItem — the attendance bonus rule
// ---------------------------------------------------------------------------

describe("computePayrollItem attendance bonus", () => {
  const base = {
    basicSalary: 180_000,
    workingDays: 27,
    otDays: 0,
    adHocBonuses: 0,
    advanceDeduction: 0,
    fineDeduction: 0,
  };

  it("pays the bonus on perfect attendance", () => {
    const r = computePayrollItem({ ...base, absentDays: 0, attendanceBonusAmt: 20_000 });
    expect(r.attendanceBonus).toBe(20_000);
    expect(r.grossPay).toBe(200_000);
  });

  it("withholds the bonus after a single absent day", () => {
    const r = computePayrollItem({ ...base, absentDays: 1, attendanceBonusAmt: 20_000 });
    expect(r.attendanceBonus).toBe(0);
  });

  it("still pays the bonus when OT fully offsets the absences", () => {
    const r = computePayrollItem({ ...base, absentDays: 2, otDays: 2, attendanceBonusAmt: 20_000 });
    expect(r.netAbsent).toBe(0);
    expect(r.attendanceBonus).toBe(20_000);
  });

  it("pays nothing when the employee has no bonus configured, however perfect", () => {
    // Regression guard for Aug 2026: three staff with zero absences showed no
    // bonus because their Employee.attendanceBonus was 0, not because of a
    // calculation fault. Payroll can only pay what the employee record allows.
    const r = computePayrollItem({ ...base, absentDays: 0, attendanceBonusAmt: 0 });
    expect(r.attendanceBonus).toBe(0);
    expect(r.grossPay).toBe(180_000);
  });
});

// ---------------------------------------------------------------------------
// allocateDeductions
// ---------------------------------------------------------------------------

describe("allocateDeductions", () => {
  const fine = (id: string, amount: number) => ({ id, amount });

  it("collects everything when gross pay covers it", () => {
    const r = allocateDeductions(180_000, [fine("f1", 15_000)], [fine("a1", 20_000)]);
    expect(r.fineDeduction).toBe(15_000);
    expect(r.advanceDeduction).toBe(20_000);
    expect(r.netPay).toBe(145_000);
    expect(r.collectedFines.map((f) => f.id)).toEqual(["f1"]);
    expect(r.collectedAdvances.map((a) => a.id)).toEqual(["a1"]);
  });

  it("takes fines before advances", () => {
    const r = allocateDeductions(50_000, [fine("f1", 40_000)], [fine("a1", 40_000)]);
    expect(r.fineDeduction).toBe(40_000);
    expect(r.advanceDeduction).toBe(0);
    expect(r.netPay).toBe(10_000);
  });

  it("never part-pays a row — it is collected in full or left outstanding", () => {
    const r = allocateDeductions(30_000, [], [fine("a1", 50_000)]);
    expect(r.advanceDeduction).toBe(0);
    expect(r.collectedAdvances).toEqual([]);
    expect(r.netPay).toBe(30_000);
  });

  it("stops at the first row that does not fit rather than skipping to a smaller one", () => {
    // a1 is older; letting the cheaper a2 jump the queue would age a1 forever.
    const r = allocateDeductions(30_000, [], [fine("a1", 50_000), fine("a2", 5_000)]);
    expect(r.collectedAdvances).toEqual([]);
    expect(r.netPay).toBe(30_000);
  });

  it("never returns a negative net pay", () => {
    const r = allocateDeductions(-5_000, [fine("f1", 1_000)], []);
    expect(r.netPay).toBe(0);
    expect(r.fineDeduction).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// belongsOnPayslip
// ---------------------------------------------------------------------------

describe("belongsOnPayslip", () => {
  const row = (over: Partial<ScheduledDeduction> = {}): ScheduledDeduction => ({
    month: 8,
    year: 2026,
    deducted: false,
    deductedMonth: null,
    deductedYear: null,
    ...over,
  });

  it("lists an outstanding row on its own month's draft slip", () => {
    expect(belongsOnPayslip(row(), 8, 2026, false)).toBe(true);
  });

  it("keeps an earlier month's row off this month's slip", () => {
    // The whole point of the month-scoping fix: July advances must not appear
    // on, or be deducted by, the August payroll.
    expect(belongsOnPayslip(row({ month: 7 }), 8, 2026, false)).toBe(false);
    expect(belongsOnPayslip(row({ month: 7, deducted: true, deductedMonth: 8, deductedYear: 2026 }), 8, 2026, true)).toBe(false);
  });

  it("keeps a later month's row off this month's slip", () => {
    expect(belongsOnPayslip(row({ month: 9 }), 8, 2026, false)).toBe(false);
  });

  it("distinguishes the same month number in a different year", () => {
    expect(belongsOnPayslip(row({ year: 2025 }), 8, 2026, false)).toBe(false);
  });

  it("shows only what was actually collected once the payroll is locked", () => {
    const collected = row({ deducted: true, deductedMonth: 8, deductedYear: 2026 });
    const uncollected = row({ deducted: false });
    expect(belongsOnPayslip(collected, 8, 2026, true)).toBe(true);
    expect(belongsOnPayslip(uncollected, 8, 2026, true)).toBe(false);
  });

  it("hides an already-collected row from a draft slip so nothing is billed twice", () => {
    expect(belongsOnPayslip(row({ deducted: true, deductedMonth: 8, deductedYear: 2026 }), 8, 2026, false)).toBe(false);
  });

  it("falls back to the booked month for rows collected before the audit stamp existed", () => {
    expect(belongsOnPayslip(row({ deducted: true }), 8, 2026, true)).toBe(true);
  });
});
