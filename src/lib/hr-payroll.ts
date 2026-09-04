// Pure payroll computation — no Prisma imports, safe to use in client previews.

export interface PayrollInputs {
  basicSalary: number;
  workingDays: number;   // calendar working days (calendar days minus rest days)
  absentDays: number;    // present-basis: ABSENT/LEAVE rows *and* any working day with
                         // no attendance record at all (both unpaid; half-day = 0.5)
  otDays: number;        // days marked OT (extra days worked beyond required)
  attendanceBonusAmt: number;
  adHocBonuses: number;
  advanceDeduction: number;
  fineDeduction: number;
}

export interface PayrollResult {
  dailyRate: number;
  netAbsent: number;    // max(0, absent - ot)
  extraOt: number;      // max(0, ot - absent) → days above working days
  absenceDeduction: number;
  otPremium: number;    // extra half-pay for days beyond working days
  attendanceBonus: number;
  grossPay: number;
  netPay: number;
}

/** Working days in a given month for an employee, given their rest-day numbers (0=Sun..6=Sat). */
export function workingDaysInMonth(year: number, month: number, restDays: number[]): number {
  const daysInMonth = new Date(year, month, 0).getDate(); // month is 1-based
  let working = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay(); // 0=Sun
    if (!restDays.includes(dow)) working++;
  }
  return working;
}

export function computePayrollItem(inputs: PayrollInputs): PayrollResult {
  const {
    basicSalary,
    workingDays,
    absentDays,
    otDays,
    attendanceBonusAmt,
    adHocBonuses,
    advanceDeduction,
    fineDeduction,
  } = inputs;

  const dailyRate = workingDays > 0 ? Math.round(basicSalary / workingDays) : 0;

  const netAbsent = Math.max(0, absentDays - otDays);
  const extraOt = Math.max(0, otDays - absentDays);

  const absenceDeduction = netAbsent * dailyRate;
  // Extra OT days already receive a full daily rate via basePay; we add the extra 0.5×
  const otPremium = Math.round(extraOt * dailyRate * 0.5);

  const attendanceBonus = netAbsent === 0 ? attendanceBonusAmt : 0;

  const grossPay = basicSalary - absenceDeduction + otPremium + attendanceBonus + adHocBonuses;
  const netPay = Math.max(0, grossPay - advanceDeduction - fineDeduction);

  return {
    dailyRate,
    netAbsent,
    extraOt,
    absenceDeduction,
    otPremium,
    attendanceBonus,
    grossPay,
    netPay,
  };
}

// ---------------------------------------------------------------------------
// Deduction collection
// ---------------------------------------------------------------------------

export interface Deductible {
  id: string;
  amount: number;
}

export interface DeductionAllocation<F extends Deductible, A extends Deductible> {
  collectedFines: F[];
  collectedAdvances: A[];
  fineDeduction: number;
  advanceDeduction: number;
  netPay: number;
}

/**
 * Decide which outstanding fines and advance instalments a payroll run can
 * actually collect out of `grossPay`.
 *
 * Rules (unchanged from the original inline logic in lockPayroll):
 *  - Fines are collected before advances — they're disciplinary. Judgment
 *    call; flip the two loops if the business ever wants advances first.
 *  - Each row is atomic: collected in full or not at all, so nothing needs
 *    fractional tracking. Anything left uncollected stays outstanding and is
 *    retried by the next month's payroll.
 *  - Both lists must already be ordered oldest-first. On the first row that
 *    doesn't fit we stop, rather than skipping ahead to a smaller one — an
 *    older debt never gets overtaken by a newer one.
 */
export function allocateDeductions<F extends Deductible, A extends Deductible>(
  grossPay: number,
  outstandingFines: F[],
  outstandingAdvances: A[],
): DeductionAllocation<F, A> {
  let available = Math.max(0, grossPay);

  const collectedFines: F[] = [];
  let fineDeduction = 0;
  for (const fine of outstandingFines) {
    if (fine.amount > available) break;
    collectedFines.push(fine);
    available -= fine.amount;
    fineDeduction += fine.amount;
  }

  const collectedAdvances: A[] = [];
  let advanceDeduction = 0;
  for (const inst of outstandingAdvances) {
    if (inst.amount > available) break;
    collectedAdvances.push(inst);
    available -= inst.amount;
    advanceDeduction += inst.amount;
  }

  return { collectedFines, collectedAdvances, fineDeduction, advanceDeduction, netPay: available };
}

// ---------------------------------------------------------------------------
// Payslip deduction lines
// ---------------------------------------------------------------------------

/** A row scheduled against a month, which may or may not have been collected yet. */
export interface ScheduledDeduction {
  /** Month the row is booked against, i.e. the payroll that collects it (1-based). */
  month: number;
  year: number;
  deducted: boolean;
  /** Month the payroll run actually collected it in — null on legacy rows. */
  deductedMonth: number | null;
  deductedYear: number | null;
}

/**
 * Does this scheduled fine / advance instalment belong on the payslip for
 * `month`/`year`?
 *
 * Deductions are strictly month-scoped: a row is collected by the payroll for
 * the month it was booked against, and by no other. So the payslip lists the
 * rows booked for this month, and the only thing that varies is whether the
 * payroll has been locked yet:
 *
 *  - DRAFT — everything booked for this month and still outstanding. Matches
 *    generatePayroll's projected Advance / Fines columns.
 *  - LOCKED — only what lockPayroll actually collected. A row that grossPay
 *    couldn't cover stays outstanding and is left off the slip, so the slip
 *    always reconciles to the net pay actually paid.
 *
 * `deductedMonth`/`deductedYear` are the audit stamp of which run collected a
 * row. Rows collected before that stamp existed have it null; those fall back
 * to the month they were booked against, which is what the older, roll-forward
 * behaviour effectively assumed.
 */
export function belongsOnPayslip(
  row: ScheduledDeduction,
  month: number,
  year: number,
  payrollLocked: boolean,
): boolean {
  if (row.year !== year || row.month !== month) return false;
  if (!payrollLocked) return !row.deducted;
  if (!row.deducted) return false;
  if (row.deductedYear === null || row.deductedMonth === null) return true; // legacy, pre-stamp row
  return row.deductedYear === year && row.deductedMonth === month;
}
