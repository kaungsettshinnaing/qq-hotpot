// Pure payroll computation — no Prisma imports, safe to use in client previews.

export interface PayrollInputs {
  basicSalary: number;
  workingDays: number;   // calendar working days (calendar days minus rest days)
  absentDays: number;    // ABSENT + LEAVE days (both are unpaid; half-day = 0.5)
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
