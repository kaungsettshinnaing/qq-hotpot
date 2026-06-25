# HR & Payroll Module — Developer Reference

> Companion to `docs/POS.md`. Keep this file updated whenever the HR module changes.

---

## Role access map

| Route prefix    | Allowed roles                          |
|-----------------|----------------------------------------|
| `/hr/*`         | HR, ADMIN                              |
| `/manager/*`    | MANAGER, ADMIN                         |
| `/my-account/*` | All authenticated users (every role)   |
| `/admin/hr-fields` | ADMIN only                          |

Enforced via `requireAnyRole([...])` in each layout. See `src/lib/rbac.ts` for `ROUTE_ROLES`.

---

## Data models

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
  startDate, endDate, dateOfBirth, phone, address, emergencyContact, bankAccount
}
```

### Attendance

One row per employee per calendar day. The `status` enum drives payroll counting.

```prisma
Attendance {
  id, employeeId, date   // @@unique([employeeId, date])
  status: PRESENT | ABSENT | LEAVE | REST_DAY | OT
  clockInAt?, clockOutAt?, breakOutAt?, breakInAt?
  isApproved, approvedById?, note?
}
```

- `ABSENT` = unexcused absence → counted toward absent days
- `LEAVE` = approved leave → also counted as absent for payroll
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

On approval: `Attendance` rows are upserted as `LEAVE` for each day in range.

### SalaryAdvance + AdvanceInstalment

```prisma
SalaryAdvance { id, employeeId, totalAmount, note, createdById }
AdvanceInstalment { id, advanceId, month, year, amount, deducted Boolean }
```

- An advance is split into monthly instalments; each instalment is deducted from the matching payroll month.
- `deducted = true` once payroll is locked — cannot be deleted or modified after.

### EmployeeFine

```prisma
EmployeeFine { id, employeeId, amount, reason, deductMonth, deductYear, deducted Boolean }
```

One-time deduction in the specified payroll month. `deducted = true` after payroll lock.

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

Payroll can be regenerated while in `DRAFT`. Once `LOCKED`, no changes are allowed and all advance instalments + fines for that month are marked `deducted = true`.

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

Counted by `src/lib/hr-attendance.ts → getAttendanceSummary(employeeId, year, month, restDays)`:

- `absentDays` = rows where status is `ABSENT` or `LEAVE`
- `otDays` = rows where status is `OT`
- `workingDays` = computed from restDays, not from attendance rows

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
  hr-attendance.ts       getMonthAttendance(), getAttendanceSummary(), getLiveAttendanceStatus(), getTodayAttendance()
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
      page.tsx           employee list
      new/page.tsx       onboarding form
      [id]/page.tsx      profile (read-only)
      [id]/edit/page.tsx edit form with custom fields
      [id]/documents/page.tsx  document upload + list
      actions.ts         createEmployee, updateEmployee, toggleEmployeeActive, uploadDocument, deleteDocument
    attendance/
      page.tsx           monthly grid + manual mark
      actions.ts         markAttendance, approveAttendance
    leave/
      page.tsx           leave queue (approve/reject) + mark absence directly
      actions.ts         hrReviewLeave, hrMarkAbsence
    advances/
      page.tsx           advance list + instalment management
      actions.ts         createAdvance, addInstalment, deleteInstalment
    fines/
      page.tsx           fine list + add form
      actions.ts         createFine, deleteFine
    payroll/
      page.tsx           monthly payroll list (DRAFT/LOCKED)
      [yearMonth]/
        page.tsx         generate/view/lock payroll for a month
        actions.ts       generatePayroll, lockPayroll
        slip/[employeeId]/page.tsx  printable individual payslip

  manager/
    layout.tsx           requireAnyRole([MANAGER, ADMIN]), tab nav
    page.tsx             manager dashboard (summary counts)
    attendance/
      page.tsx           live attendance status + pending approvals
      LiveAttendance.tsx client component, useRoomRefresh("hr", [...])
    leave/
      page.tsx           leave approval queue + recent decisions

  my-account/
    layout.tsx           any authenticated user
    page.tsx             employee's own payslip list
    [yearMonth]/slip/page.tsx   view own payslip
    leave/
      page.tsx           own leave history
      new/page.tsx       submit leave request
    clock/
      page.tsx           clock in/out/break UI (mobile-friendly, large buttons)
      actions.ts         clockIn, clockOut, breakOut, breakIn
```

---

## Business rules

### Rest days
- Stored as `Int[]` on Employee — weekday numbers `[0..6]` where 0 = Sunday.
- `workingDaysInMonth` loops every calendar day and counts those whose `getDay()` is NOT in `restDays`.
- Each occurrence in the month is excluded; e.g. if restDays = [0] in a 30-day month with 5 Sundays → workingDays = 25.

### OT
- An employee who works on a rest day gets an `OT` attendance status (set manually by HR or via a future manager action).
- OT days first offset absences (`net_absent = max(0, absent − ot)`).
- OT days in excess of absences earn a 0.5× premium on top of the regular daily rate (since the base already includes the full day's pay in the working-days structure).

### Attendance bonus
- Fixed per-employee amount stored on the `Employee` model.
- Awarded only when `net_absent === 0` (after OT offset). Even 1 net absent day = no bonus.

### Leave
- Employee submits via `/my-account/leave/new` → creates a `LeaveRequest` with status `PENDING`.
- OR HR marks absence directly via `/hr/leave` (creates `Attendance` rows immediately, no request needed).
- Manager or HR approves a `LeaveRequest` → auto-creates `Attendance` rows (`status: LEAVE`) for each day in the range, marks the request `APPROVED`.
- Approved leave days count as absences in payroll.

### Payroll generation
1. For each active employee: read attendance summary for the month.
2. Collect ad-hoc bonuses, advance instalments, and fines targeting this month.
3. Run `computePayrollItem()` to get all computed fields.
4. Upsert a `PayrollItem` row (idempotent — regeneration overwrites draft items).
5. Cannot regenerate a `LOCKED` payroll.

### Payroll lock
- Sets `Payroll.status = LOCKED`.
- Marks all `AdvanceInstalment` and `EmployeeFine` rows for this month as `deducted = true`.
- Irreversible — no unlock flow exists.

### Advance instalments + fines lifecycle
- Created by HR with a target `month/year`.
- Included automatically in `generatePayroll()` for that month.
- `deducted = true` only after the payroll for that month is locked.
- Cannot delete an instalment or fine once `deducted = true`.

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
2. Add to the migration SQL.
3. Call `createNotification(userId, "NEW_TYPE", message)` where needed.
4. Optionally handle `type === "NEW_TYPE"` in `NotifBell.tsx` for a custom icon or label.

### Adding a new custom field type
- `FieldType` enum is in the schema: `TEXT | NUMBER | DATE | DROPDOWN`.
- The employee edit page (`hr/employees/[id]/edit/page.tsx`) renders each type differently.
- To add a new type: add to the enum, add SQL migration, add a render case in the edit page.

### Modifying attendance statuses
- `AttendanceStatus` enum: `PRESENT | ABSENT | LEAVE | REST_DAY | OT`.
- `getAttendanceSummary()` in `hr-attendance.ts` maps statuses to `absentDays`/`otDays` for payroll.
- If you add a new status, update the mapping there and document payroll impact here.

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
