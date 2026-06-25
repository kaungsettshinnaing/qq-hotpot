-- HR & Payroll module migration

-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'DROPDOWN');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LEAVE', 'REST_DAY', 'OT');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'LOCKED');

-- CreateEnum
CREATE TYPE "NotifType" AS ENUM ('BREAK_OUT', 'BREAK_IN', 'LEAVE_REQUEST', 'ATTENDANCE_APPROVED', 'LEAVE_APPROVED', 'LEAVE_REJECTED');

-- CreateTable: Employee (1-to-1 with User)
CREATE TABLE "Employee" (
    "userId"           TEXT NOT NULL,
    "employeeNo"       TEXT,
    "dateOfBirth"      TIMESTAMP(3),
    "phone"            TEXT,
    "address"          TEXT,
    "emergencyContact" TEXT,
    "bankAccount"      TEXT,
    "startDate"        TIMESTAMP(3) NOT NULL,
    "endDate"          TIMESTAMP(3),
    "basicSalary"      INTEGER NOT NULL DEFAULT 0,
    "attendanceBonus"  INTEGER NOT NULL DEFAULT 0,
    "restDays"         INTEGER[],
    "isActive"         BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("userId")
);

-- CreateTable: EmployeeFieldDef
CREATE TABLE "EmployeeFieldDef" (
    "id"         TEXT NOT NULL,
    "label"      TEXT NOT NULL,
    "fieldType"  "FieldType" NOT NULL DEFAULT 'TEXT',
    "options"    TEXT[],
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder"  INTEGER NOT NULL DEFAULT 0,
    "isActive"   BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "EmployeeFieldDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable: EmployeeFieldValue
CREATE TABLE "EmployeeFieldValue" (
    "id"         TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "fieldDefId" TEXT NOT NULL,
    "value"      TEXT NOT NULL,

    CONSTRAINT "EmployeeFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable: EmployeeDocument
CREATE TABLE "EmployeeDocument" (
    "id"           TEXT NOT NULL,
    "employeeId"   TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "filePath"     TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Attendance
CREATE TABLE "Attendance" (
    "id"           TEXT NOT NULL,
    "employeeId"   TEXT NOT NULL,
    "date"         DATE NOT NULL,
    "status"       "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "clockInAt"    TIMESTAMP(3),
    "clockOutAt"   TIMESTAMP(3),
    "breakOutAt"   TIMESTAMP(3),
    "breakInAt"    TIMESTAMP(3),
    "isApproved"   BOOLEAN NOT NULL DEFAULT false,
    "approvedById" TEXT,
    "note"         TEXT,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable: LeaveRequest
CREATE TABLE "LeaveRequest" (
    "id"           TEXT NOT NULL,
    "employeeId"   TEXT NOT NULL,
    "startDate"    DATE NOT NULL,
    "endDate"      DATE NOT NULL,
    "reason"       TEXT,
    "status"       "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt"   TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SalaryAdvance
CREATE TABLE "SalaryAdvance" (
    "id"          TEXT NOT NULL,
    "employeeId"  TEXT NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "note"        TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalaryAdvance_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AdvanceInstalment
CREATE TABLE "AdvanceInstalment" (
    "id"        TEXT NOT NULL,
    "advanceId" TEXT NOT NULL,
    "month"     INTEGER NOT NULL,
    "year"      INTEGER NOT NULL,
    "amount"    INTEGER NOT NULL,
    "deducted"  BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AdvanceInstalment_pkey" PRIMARY KEY ("id")
);

-- CreateTable: EmployeeFine
CREATE TABLE "EmployeeFine" (
    "id"          TEXT NOT NULL,
    "employeeId"  TEXT NOT NULL,
    "amount"      INTEGER NOT NULL,
    "reason"      TEXT NOT NULL,
    "deductMonth" INTEGER NOT NULL,
    "deductYear"  INTEGER NOT NULL,
    "deducted"    BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeFine_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AdHocBonus
CREATE TABLE "AdHocBonus" (
    "id"          TEXT NOT NULL,
    "employeeId"  TEXT NOT NULL,
    "amount"      INTEGER NOT NULL,
    "label"       TEXT NOT NULL,
    "month"       INTEGER NOT NULL,
    "year"        INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdHocBonus_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Payroll
CREATE TABLE "Payroll" (
    "id"         TEXT NOT NULL,
    "month"      INTEGER NOT NULL,
    "year"       INTEGER NOT NULL,
    "status"     "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "lockedAt"   TIMESTAMP(3),
    "lockedById" TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payroll_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PayrollItem
CREATE TABLE "PayrollItem" (
    "id"                 TEXT NOT NULL,
    "payrollId"          TEXT NOT NULL,
    "employeeId"         TEXT NOT NULL,
    "basicSalary"        INTEGER NOT NULL,
    "workingDays"        INTEGER NOT NULL,
    "absentDays"         INTEGER NOT NULL,
    "otDays"             INTEGER NOT NULL,
    "attendanceBonusAmt" INTEGER NOT NULL,
    "dailyRate"          INTEGER NOT NULL,
    "absenceDeduction"   INTEGER NOT NULL,
    "otPremium"          INTEGER NOT NULL,
    "adHocBonuses"       INTEGER NOT NULL,
    "advanceDeduction"   INTEGER NOT NULL,
    "fineDeduction"      INTEGER NOT NULL,
    "netPay"             INTEGER NOT NULL,

    CONSTRAINT "PayrollItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Notification
CREATE TABLE "Notification" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "type"      "NotifType" NOT NULL,
    "message"   TEXT NOT NULL,
    "isRead"    BOOLEAN NOT NULL DEFAULT false,
    "relatedId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_employeeNo_key" UNIQUE ("employeeNo");
ALTER TABLE "EmployeeFieldValue" ADD CONSTRAINT "EmployeeFieldValue_employeeId_fieldDefId_key" UNIQUE ("employeeId", "fieldDefId");
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_employeeId_date_key" UNIQUE ("employeeId", "date");
ALTER TABLE "Payroll" ADD CONSTRAINT "Payroll_month_year_key" UNIQUE ("month", "year");
ALTER TABLE "PayrollItem" ADD CONSTRAINT "PayrollItem_payrollId_employeeId_key" UNIQUE ("payrollId", "employeeId");

-- Indexes
CREATE INDEX "EmployeeFieldValue_employeeId_idx" ON "EmployeeFieldValue"("employeeId");
CREATE INDEX "EmployeeDocument_employeeId_idx" ON "EmployeeDocument"("employeeId");
CREATE INDEX "Attendance_employeeId_idx" ON "Attendance"("employeeId");
CREATE INDEX "Attendance_date_idx" ON "Attendance"("date");
CREATE INDEX "LeaveRequest_employeeId_idx" ON "LeaveRequest"("employeeId");
CREATE INDEX "LeaveRequest_status_idx" ON "LeaveRequest"("status");
CREATE INDEX "SalaryAdvance_employeeId_idx" ON "SalaryAdvance"("employeeId");
CREATE INDEX "AdvanceInstalment_advanceId_idx" ON "AdvanceInstalment"("advanceId");
CREATE INDEX "AdvanceInstalment_year_month_idx" ON "AdvanceInstalment"("year", "month");
CREATE INDEX "EmployeeFine_employeeId_idx" ON "EmployeeFine"("employeeId");
CREATE INDEX "EmployeeFine_deductYear_deductMonth_idx" ON "EmployeeFine"("deductYear", "deductMonth");
CREATE INDEX "AdHocBonus_employeeId_idx" ON "AdHocBonus"("employeeId");
CREATE INDEX "AdHocBonus_year_month_idx" ON "AdHocBonus"("year", "month");
CREATE INDEX "PayrollItem_payrollId_idx" ON "PayrollItem"("payrollId");
CREATE INDEX "PayrollItem_employeeId_idx" ON "PayrollItem"("employeeId");
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- Foreign keys
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeFieldValue" ADD CONSTRAINT "EmployeeFieldValue_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeFieldValue" ADD CONSTRAINT "EmployeeFieldValue_fieldDefId_fkey" FOREIGN KEY ("fieldDefId") REFERENCES "EmployeeFieldDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalaryAdvance" ADD CONSTRAINT "SalaryAdvance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalaryAdvance" ADD CONSTRAINT "SalaryAdvance_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdvanceInstalment" ADD CONSTRAINT "AdvanceInstalment_advanceId_fkey" FOREIGN KEY ("advanceId") REFERENCES "SalaryAdvance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeFine" ADD CONSTRAINT "EmployeeFine_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeFine" ADD CONSTRAINT "EmployeeFine_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdHocBonus" ADD CONSTRAINT "AdHocBonus_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdHocBonus" ADD CONSTRAINT "AdHocBonus_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payroll" ADD CONSTRAINT "Payroll_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayrollItem" ADD CONSTRAINT "PayrollItem_payrollId_fkey" FOREIGN KEY ("payrollId") REFERENCES "Payroll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollItem" ADD CONSTRAINT "PayrollItem_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
