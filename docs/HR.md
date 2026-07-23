# HR & Payroll Module — Developer Reference

> Companion to `docs/POS.md`. Keep this file updated whenever the HR module changes.

---

## Role access map

| Route prefix       | Allowed roles                                         |
|--------------------|-------------------------------------------------------|
| `/hr/*`            | HR, ADMIN                                             |
| `/manager/*`       | MANAGER, ADMIN                                        |
| `/my-account/*`    | All authenticated users (every role)                  |
| `/admin/hr-fields` | ADMIN only                                            |

Enforced via `requireAnyRole([...])` in each layout. See `src/lib/rbac.ts` for `ROUTE_ROLES`.

---

## Data models

### User

```prisma
User {
  id, username, name, passwordHash, pinHash?
  roles: Role[]
  isActive: Boolean
  isSystemAccount: Boolean   // true = non-employee system login (no Employee record)
}
```

`isSystemAccount` flags login-only accounts that have no `Employee` record and are managed from the "System Accounts" tab in HR → Employees.

### Employee

Primary key is `userId String @id` — the same ID as the linked `User`. There is no separate `id` field. All child relations reference `employeeId` which maps to `userId`.

```prisma
Employee {
  userId          String    @id   // = User.id
  employeeNo      String?   @unique
  basicSalary     Int               // MMK/month, whole number
  attendanceBonus Int               // per-month bonus if net absences = 0
  restDays        Int[]             // weekday numbers 0=Sun..6=Sat, e.g. [0,1]
  isActive        Boolean
  isSystem        Boolean           // login-only; excluded from attendance & payroll
  startDate, endDate, dateOfBirth, phone, address, emergencyContact, bankAccount
}
```

**`isSystem = true`** marks employees who are onboarded but serve as view-only login accounts. They appear in the employee list with a purple "System" badge but are excluded from:
- Live attendance tracking (`getLiveAttendanceStatus`)
- HR attendance monthly grid
- Manager dashboard attendance counts
- Payroll generation

### Attendance

One row per employee per calendar day. The `status` enum drives payroll counting.

```prisma
Attendance {
  id, employeeId, date   // @@unique([employeeId, date])
  status: PRESENT | ABSENT | LEAVE | REST_DAY | OT
  dayType: FULL | HALF
  clockInAt?, clockOutAt?
  isApproved, approvedById?, note?
  breaks: Break[]
}

Break {
  id, attendanceId, startAt, endAt?
}
```

- `ABSENT` = unexcused absence → counted toward absent days in payroll
- `LEAVE` = approved leave → **also unpaid** (counted as absent for payroll, same as ABSENT)
- `OT` = worked on a scheduled rest day → offsets absences / earns premium
- `REST_DAY` = rest day with no work (informational only, not counted)
- `PRESENT` = normal working day

### LeaveRequest

```prisma
LeaveRequest {
  id, employeeId, startDate, endDate, reason?
  status: PENDING | APPROVED | REJECTED
  reviewedById?, reviewedAt?
}
```

- Employees submit single-day requests (one per date; `endDate = startDate`).
  Multiple days require multiple submissions.
- On approval: `Attendance` row is upserted as `LEAVE` for the date.
- HR can also mark absence directly from `/hr/leave` without a request.

### SalaryAdvance + AdvanceInstalment

```prisma
SalaryAdvance { id, employeeId, totalAmount, note, createdById }
AdvanceInstalment { id, advanceId, month, year, amount, deducted Boolean }
```

- `createAdvance` creates both the parent `SalaryAdvance` and an `AdvanceInstalment` in one atomic call.
- Each instalment targets a specific `month/year` for payroll deduction.
- `deducted = true` once the matching payroll is locked — cannot be deleted after.
- Deleting an instalment also deletes the parent `SalaryAdvance` if no other instalments remain.

### EmployeeFine

```prisma
EmployeeFine { id, employeeId, amount, reason, deductMonth, deductYear, deducted Boolean, createdById }
```

- Created by HR, ADMIN, or **MANAGER** (MANAGER can create fines directly from the manager dashboard).
- One-time deduction in the specified payroll month. `deducted = true` after payroll lock.

### AdHocBonus

```prisma
AdHocBonus { id, employeeId, amount, label, month, year, createdById }
```

Added by HR per employee per month. Included in gross pay.

### Payroll + PayrollItem

```prisma
Payroll { id, month, year, status: DRAFT | LOCKED, lockedById?, lockedAt?  @@unique([month, year]) }

PayrollItem {
  id, payrollId, employeeId
  // Inputs (snapshotted at generation)
  basicSalary, workingDays, absentDays, otDays, attendanceBonusAmount
  // Computed
  dailyRate, absenceDeduction, otPremium, adHocBonuses, advanceDeduction, fineDeduction, netPay
  @@unique([payrollId, employeeId])
}
```

Payroll can be regenerated while in `DRAFT`. Once `LOCKED`, no changes are allowed and all advance instalments + fines for that month are marked `deducted = true`. System employees (`isSystem = true`) are **excluded** from payroll generation.

### Custom fields

```prisma
EmployeeFieldDef { id, label, fieldType: TEXT|NUMBER|DATE|DROPDOWN, options String[], isRequired, sortOrder, isActive }
EmployeeFieldValue { employeeId, fieldDefId, value String   @@unique([employeeId, fieldDefId]) }
```

Admin creates field definitions in `/admin/hr-fields`. HR fills values per employee in the employee edit form.

### Notification

```prisma
Notification { id, userId (recipient), type: NotifType, message, isRead, relatedId?, createdAt }
```

Displayed in the bell dropdown in AppShell. Emitted to Socket.IO `hr` room on creation.

```ts
enum NotifType {
  BREAK_OUT, BREAK_IN,
  LEAVE_REQUEST, ATTENDANCE_APPROVED,
  LEAVE_APPROVED, LEAVE_REJECTED
}
```

---

## Payroll formula

```
working_days    = calendar days in month − rest-day occurrences for this employee

daily_rate      = round(basicSalary / workingDays)

net_absent      = max(0, absentDays − otDays)      // OT offsets absences first
extra_ot        = max(0, otDays − absentDays)       // OT days beyond absent count

absence_deduct  = net_absent × daily_rate
ot_premium      = round(extra_ot × daily_rate × 0.5)   // full day already in base; add 0.5×
attendance_bon  = attendanceBonusAmt   if net_absent == 0   else 0

gross = basicSalary − absence_deduct + ot_premium + attendance_bon + Σ(adHocBonuses)
net   = max(0, gross − Σ(advance_instalments for this month) − Σ(fines for this month))
```

Lives in `src/lib/hr-payroll.ts` → `computePayrollItem(inputs)` and `workingDaysInMonth(year, month, restDays)`.

---

## Attendance status counts (for payroll)

Counted by `src/lib/hr-attendance.ts → getAttendanceSummary(employeeId, year, month, restDays)`.

**Present-basis**, not absent-basis: the function loops every calendar day of the month, skips
scheduled rest days, and for every remaining working day requires a positive attendance record to
count as paid. A working day with no attendance row at all (e.g. every day after an employee has
left, or every day before a mid-month hire's start date) counts as absent — it is not implicitly
treated as present. This is what makes mid-month departures and mid-month starts prorate correctly
without any separate start/end-date logic.

- `absentDays` = rows where status is `ABSENT` **or** `LEAVE`, **plus** any working day in the
  month with no attendance row at all (all unpaid; half-day = 0.5)
- `otDays` = rows where status is `OT`
- `workingDays` = computed from restDays, not from attendance rows
- `PRESENT` (full day) or a manually-marked `REST_DAY` on a working day count as fully paid, no
  deduction

---

## Live attendance status

`getLiveAttendanceStatus()` returns one record per **active, non-system** employee:

```ts
{
  employeeId: string
  name: string
  attendance: Attendance | null
  status: "not_started" | "working" | "on_break" | "clocked_out" | "on_leave"
  openBreak: Break | null
  breakCount: number
  totalBreakMins: number   // sum of all completed + ongoing breaks today
}
```

- `on_leave` = no attendance row today, but an approved `LeaveRequest` covering today exists.
- System employees (`isSystem: true`) are excluded from this query.

---

## Real-time (Socket.IO)

Room: **`hr`** — joined by managers/admins.

| Event emitted          | Trigger                              | Who listens                     |
|------------------------|--------------------------------------|---------------------------------|
| `attendance:update`    | Clock in, clock out                  | Manager live dashboard          |
| `break:out`            | Employee starts break                | Manager live dashboard + bell   |
| `break:in`             | Employee returns from break          | Manager live dashboard + bell   |
| `notification:new`     | Any `createNotification()` call      | `NotifBell` client component    |

Emitted via `src/lib/realtime.ts → emitHR(event, payload)` (best-effort, try/catch).

---

## File map

```
src/lib/
  hr-payroll.ts          computePayrollItem(), workingDaysInMonth()
  hr-attendance.ts       getMonthAttendance(), getAttendanceSummary(), getLiveAttendanceStatus()
  notifications.ts       createNotification(), notifyManagers()

src/components/
  AppShell.tsx           async server component — loads notifications from DB, renders NotifBell
  NotifBell.tsx          client component — bell icon, unread badge, dropdown, Socket.IO hr room

src/app/(app)/
  admin/
    hr-fields/page.tsx   Admin: create/toggle EmployeeFieldDef

  hr/
    layout.tsx           requireAnyRole([HR, ADMIN]), tab nav
    page.tsx             HR dashboard (headcount, pending leaves, unapproved attendance)
    employees/
      page.tsx           employee list (tabs: Active | Inactive | System Accounts)
      new/page.tsx       onboarding form (includes "System account" checkbox)
      actions.ts         createEmployee (accepts isSystem), updateEmployee, toggleEmployeeActive,
                         toggleEmployeeSystem, deleteEmployee, resetEmployeePassword,
                         uploadDocument, deleteDocument,
                         createSystemAccount, toggleSystemAccountActive, resetSystemAccountPassword
      [id]/page.tsx      profile (read-only) — shows System badge, Mark/Unmark System toggle,
                         Deactivate/Activate, Delete buttons
      [id]/DeleteEmployeeButton.tsx   client component — confirm dialog + deleteEmployee
      [id]/edit/page.tsx edit form with custom fields
      [id]/documents/page.tsx  document upload + list
    attendance/
      page.tsx           monthly grid (shows RE badge for rest days without attendance records)
                         + manual mark form + pending approvals
      actions.ts         markAttendance, approveAttendance
    leave/
      page.tsx           leave queue (approve/reject) + mark absence directly
      actions.ts         hrReviewLeave, hrMarkAbsence
    advances/
      page.tsx           flat list of advance instalments + "Add Advance" form
                         (Employee | Amount | Note | Deduct Month | Year)
      actions.ts         createAdvance (atomic: creates SalaryAdvance + AdvanceInstalment),
                         deleteInstalment (cascades parent if no other instalments remain)
    fines/
      page.tsx           fine list + add form
      actions.ts         createFine (HR | ADMIN | MANAGER), deleteFine (HR | ADMIN | MANAGER)
    payroll/
      page.tsx           monthly payroll list (DRAFT/LOCKED)
      [yearMonth]/
        page.tsx         generate/view/lock payroll for a month
        actions.ts       generatePayroll (excludes isSystem employees), lockPayroll
        slip/[employeeId]/page.tsx  printable individual payslip

  manager/
    layout.tsx           requireAnyRole([MANAGER, ADMIN]), tab nav
    page.tsx             manager dashboard: live attendance summary (names on Working/On Break
                         cards, total break time), Add Fine form, Recent Fines table
    attendance/
      page.tsx           live attendance status + pending approvals
      LiveAttendance.tsx client component — on_leave support, totalBreakMins column,
                         sorted by status, legend (ABSENT vs LEAVE vs OT vs PRESENT vs REST_DAY)
    leave/
      page.tsx           leave approval queue + recent decisions

  my-account/
    layout.tsx           any authenticated user; tabs: Payslips | My Leave | Clock In/Out | Account
    page.tsx             employee's own payslip list
    [yearMonth]/slip/page.tsx   view own payslip
    leave/
      page.tsx           own leave history — shows rest days banner, single "Date" column
                         (existing multi-day records show as "startDate – endDate")
      new/page.tsx       submit single-day leave request (Date field, DD-MMM-YYYY);
                         rest days reminder shown; redirects to list after submit
    clock/
      page.tsx           clock in/out/break UI (mobile-friendly, large buttons)
      actions.ts         clockIn, clockOut, breakOut, breakIn
      LiveClock.tsx      client component — live updating HH:MM:SS time
      LiveDuration.tsx   client component — ongoing break timer (updates every 30s)
    account/
      page.tsx           change own password (current password required, min 6 chars)
                         — available to ALL authenticated users (not just employees)
```

---

## Business rules

### Rest days

- Stored as `Int[]` on Employee — weekday numbers `[0..6]` where 0 = Sunday.
- `workingDaysInMonth` loops every calendar day and counts those whose `getDay()` is NOT in `restDays`.
- Each occurrence in the month is excluded; e.g. if restDays = [0] in a 30-day month with 5 Sundays → workingDays = 25.
- The **HR attendance grid** shows "RE" (gray badge) for days that fall on an employee's rest day but have no attendance record.
- The **My Leave** and **Request Leave** pages show a rest days reminder banner to help employees avoid submitting leave on their days off.

### OT

- An employee who works on a rest day gets an `OT` attendance status (set manually by HR).
- OT days first offset absences (`net_absent = max(0, absent − ot)`).
- OT days in excess of absences earn a 0.5× premium on top of the regular daily rate (since the base already includes the full day's pay in the working-days structure).
- OT premium is only earned when total work days **exceed** the required working days for the month (i.e., when OT count > absent count).

### Attendance bonus

- Fixed per-employee amount stored on the `Employee` model.
- Awarded only when `net_absent === 0` (after OT offset). Even 1 net absent day = no bonus.

### Leave

- Employee submits via `/my-account/leave/new` → one request per date.
  `startDate` and `endDate` are both set to the same date. For multiple days off, employees submit multiple requests.
- OR HR marks absence directly via `/hr/leave` (creates `Attendance` rows immediately, no request needed).
- Manager or HR approves a `LeaveRequest` → auto-creates an `Attendance` row (`status: LEAVE`) for the date, marks the request `APPROVED`.
- **Approved leave and unexcused absences are treated identically in payroll** — both are unpaid.

### Fines

- HR, ADMIN, and **MANAGER** can all create and delete fines.
- Fines created by MANAGER are visible from both the manager dashboard and HR → Fines.
- `deducted = true` after payroll lock; cannot delete a deducted fine.

### System employees vs system accounts

Two separate concepts:

| | `Employee.isSystem = true` | `User.isSystemAccount = true` |
|---|---|---|
| Has Employee record | Yes | No |
| Shows in HR Employees list | Yes (Active/Inactive tabs, with purple "System" badge) | Yes (System Accounts tab) |
| Shows in attendance | No | — |
| Included in payroll | No | — |
| How created | Onboarding form → check "System account" | HR Employees → System Accounts tab |

Use `Employee.isSystem` for employees who are onboarded but are view-only (e.g. managers who do not clock in). Use `User.isSystemAccount` for completely non-employee logins (e.g. a dedicated POS terminal account).

### Employee deletion

`deleteEmployee(userId)` runs a single `$transaction`:
1. Deletes `EmployeeFieldValue`, `EmployeeDocument`, `LeaveRequest`, `EmployeeFine`, `AdHocBonus`, `PayrollItem` rows.
2. Deletes `SalaryAdvance` rows (cascades to `AdvanceInstalment` via `onDelete: Cascade`).
3. Deletes `Attendance` rows (cascades to `Break` via `onDelete: Cascade`).
4. Deletes the `Employee` row.
5. Sets `User.isActive = false` (deactivates the login, does not delete the `User` row to avoid FK issues with other tables).

### Payroll generation

1. For each **active, non-system** employee: read attendance summary for the month.
2. Collect ad-hoc bonuses, advance instalments, and fines targeting this month.
3. Run `computePayrollItem()` to get all computed fields.
4. Upsert a `PayrollItem` row (idempotent — regeneration overwrites draft items).
5. Cannot regenerate a `LOCKED` payroll.

### Payroll lock

- Sets `Payroll.status = LOCKED`.
- Marks all `AdvanceInstalment` and `EmployeeFine` rows for this month as `deducted = true`.
- Irreversible — no unlock flow exists.

### Advance instalments + fines lifecycle

- Created by HR/ADMIN/MANAGER with a target `month/year`.
- Included automatically in `generatePayroll()` for that month.
- `deducted = true` only after the payroll for that month is locked.
- Cannot delete an instalment or fine once `deducted = true`.

### Date input format

All HR date inputs use **DD-MMM-YYYY** format (e.g. `26-Jun-2026`), parsed by `parseInputDate()` in `src/lib/format.ts`. This overrides the browser's default `<input type="date">` locale format.

---

## Common change patterns

### Adding a new HR server action

1. Create or edit `actions.ts` in the relevant route directory.
2. Add `"use server"` at top of file.
3. Call `requireAnyRole([...])` at the start.
4. End with `revalidatePath(...)` to refresh the page.
5. Import the action in the page and pass it directly to `<form action={myAction}>`.

### Changing the payroll formula

- Edit `src/lib/hr-payroll.ts → computePayrollItem()`.
- The function is pure (no Prisma) — unit-test it in isolation.
- Re-run `generatePayroll()` on any DRAFT payroll to pick up the change.
- LOCKED payrolls retain the old numbers (snapshots).

### Adding a new notification type

1. Add the new value to `enum NotifType` in `prisma/schema.prisma`.
2. Run `prisma db push` on VPS.
3. Call `createNotification(userId, "NEW_TYPE", message)` where needed.
4. Optionally handle `type === "NEW_TYPE"` in `NotifBell.tsx` for a custom icon or label.

### Adding a new custom field type

- `FieldType` enum is in the schema: `TEXT | NUMBER | DATE | DROPDOWN`.
- The employee edit page (`hr/employees/[id]/edit/page.tsx`) renders each type differently.
- To add a new type: add to the enum, run `prisma db push`, add a render case in the edit page.

### Modifying attendance statuses

- `AttendanceStatus` enum: `PRESENT | ABSENT | LEAVE | REST_DAY | OT`.
- `getAttendanceSummary()` in `hr-attendance.ts` maps statuses to `absentDays`/`otDays` for payroll.
- If you add a new status, update the mapping there and document payroll impact here.

### Schema changes on VPS

```bash
docker compose exec app npx prisma db push
docker compose up -d --build
```

---

## Seed data

Three demo employees in `prisma/seed.ts`:
- `EMP001` — linked to the waiter user, restDays `[0]` (Sunday off)
- `EMP002` — linked to the cashier user, restDays `[0,1]` (Sunday + Monday off)
- `EMP003` — linked to the kitchen user, restDays `[0]`

Four demo custom field definitions: NRC Number (TEXT), Bank Account (TEXT), Emergency Contact Name (TEXT), Emergency Contact Phone (TEXT).

---

## Key invariants

- **Employee PK = userId**: never use `employee.id` — the field does not exist. Use `employee.userId`.
- **Payroll uniqueness**: `@@unique([month, year])` — one payroll record per calendar month across all employees.
- **Attendance uniqueness**: `@@unique([employeeId, date])` — use `upsert` with `employeeId_date` compound key when creating attendance rows from leave approval.
- **Currency**: always MMK, always whole integers (Int in Prisma). No decimals. `dailyRate` is rounded.
- **Socket.IO hr room**: emit to this room on clock events and notifications. Use `emitHR()` from `src/lib/realtime.ts`. It is best-effort (try/catch) and must not block a server action.
- **System exclusion**: always add `isSystem: false` to `Employee.findMany` queries in attendance and payroll contexts.
