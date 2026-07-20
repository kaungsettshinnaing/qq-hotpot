"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAnyRole, hashPassword } from "@/lib/auth";
import { parseInputDate } from "@/lib/format";
import type { Role } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import type { Prisma } from "@prisma/client";

/**
 * Frees up `username` if it's currently held by an inactive user, by renaming
 * their username out of the way (suffixed with their own id — deterministic,
 * guaranteed unique). Throws if it's held by an active user. No-ops if free.
 * Every audit/actor relation in the schema is a userId FK, never a username
 * string, so renaming an inactive user's username later is always safe.
 */
async function reclaimUsernameIfInactive(tx: Prisma.TransactionClient, username: string): Promise<void> {
  const existing = await tx.user.findUnique({ where: { username } });
  if (!existing) return;
  if (existing.isActive) throw new Error("USERNAME_TAKEN");
  await tx.user.update({
    where: { id: existing.id },
    data: { username: `${username}-old-${existing.id.slice(-6)}` },
  });
}

export async function createEmployee(fd: FormData) {
  await requireAnyRole(["HR", "ADMIN"]);

  const accountMode = (fd.get("accountMode") as string) ?? "link";
  let userId: string;

  if (accountMode === "create") {
    const name = (fd.get("name") as string).trim();
    const username = (fd.get("username") as string).trim().toLowerCase();
    const password = fd.get("password") as string;
    const staffRoleId = (fd.get("staffRoleId") as string | null)?.trim() ?? "";
    if (!name || !username || !password) redirect("/hr/employees/new?error=missing");
    if (!staffRoleId) redirect("/hr/employees/new?error=no-role");
    const staffRole = await prisma.staffRole.findUnique({ where: { id: staffRoleId } });
    const roles = (staffRole?.permissions ?? []) as Role[];
    try {
      const user = await prisma.$transaction(async (tx) => {
        await reclaimUsernameIfInactive(tx, username);
        return tx.user.create({
          data: { name, username, passwordHash: hashPassword(password), roles },
        });
      });
      userId = user.id;
    } catch (err) {
      if (err instanceof Error && err.message === "USERNAME_TAKEN") redirect("/hr/employees/new?error=exists");
      throw err;
    }
    // staffRoleId stored on employee below
  } else {
    userId = fd.get("userId") as string;
  }

  const staffRoleId = (fd.get("staffRoleId") as string | null)?.trim() || null;
  const employeeNo = (fd.get("employeeNo") as string).trim() || undefined;
  const startDate = parseInputDate(fd.get("startDate") as string) ?? new Date();
  const dateOfBirth = parseInputDate(fd.get("dateOfBirth") as string) ?? undefined;
  const basicSalary = parseInt(fd.get("basicSalary") as string) || 0;
  const attendanceBonus = parseInt(fd.get("attendanceBonus") as string) || 0;
  const restDaysRaw = fd.getAll("restDays").map((v) => parseInt(v as string));
  const phone = (fd.get("phone") as string).trim() || undefined;
  const address = (fd.get("address") as string).trim() || undefined;
  const emergencyContact = (fd.get("emergencyContact") as string).trim() || undefined;
  const bankAccount = (fd.get("bankAccount") as string).trim() || undefined;
  const isSystem = fd.get("isSystem") === "1";

  await prisma.employee.create({
    data: {
      userId,
      staffRoleId: staffRoleId || null,
      employeeNo,
      startDate,
      dateOfBirth,
      basicSalary,
      attendanceBonus,
      restDays: restDaysRaw,
      phone,
      address,
      emergencyContact,
      bankAccount,
      isSystem,
    },
  });

  redirect(`/hr/employees/${userId}`);
}

export async function updateEmployee(fd: FormData) {
  await requireAnyRole(["HR", "ADMIN"]);
  const userId = fd.get("userId") as string;
  const name = (fd.get("name") as string).trim();
  const username = (fd.get("username") as string).trim().toLowerCase();
  const startDate = parseInputDate(fd.get("startDate") as string) ?? new Date();
  const dateOfBirth = parseInputDate(fd.get("dateOfBirth") as string);
  const basicSalary = parseInt(fd.get("basicSalary") as string) || 0;
  const attendanceBonus = parseInt(fd.get("attendanceBonus") as string) || 0;
  const restDaysRaw = fd.getAll("restDays").map((v) => parseInt(v as string));

  if (!name) redirect(`/hr/employees/${userId}/edit?error=missing-name`);
  if (!username) redirect(`/hr/employees/${userId}/edit?error=missing-username`);

  // Check username uniqueness (excluding this user) — reclaims it if the
  // current holder is inactive, otherwise blocks as before.
  const conflict = await prisma.user.findFirst({
    where: { username, NOT: { id: userId } },
    select: { id: true, isActive: true },
  });
  if (conflict?.isActive) redirect(`/hr/employees/${userId}/edit?error=username-taken`);

  try {
    await prisma.$transaction(async (tx) => {
      if (conflict) await reclaimUsernameIfInactive(tx, username);
      await tx.user.update({ where: { id: userId }, data: { name, username } });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "USERNAME_TAKEN") {
      redirect(`/hr/employees/${userId}/edit?error=username-taken`);
    }
    throw err;
  }

  await prisma.employee.update({
    where: { userId },
    data: {
      employeeNo: (fd.get("employeeNo") as string).trim() || null,
      startDate,
      dateOfBirth,
      basicSalary,
      attendanceBonus,
      restDays: restDaysRaw,
      phone: (fd.get("phone") as string).trim() || null,
      address: (fd.get("address") as string).trim() || null,
      emergencyContact: (fd.get("emergencyContact") as string).trim() || null,
      bankAccount: (fd.get("bankAccount") as string).trim() || null,
    },
  });

  // Save custom field values
  const fieldDefs = await prisma.employeeFieldDef.findMany({ where: { isActive: true } });
  for (const def of fieldDefs) {
    const value = (fd.get(`field_${def.id}`) as string | null) ?? "";
    await prisma.employeeFieldValue.upsert({
      where: { employeeId_fieldDefId: { employeeId: userId, fieldDefId: def.id } },
      update: { value },
      create: { employeeId: userId, fieldDefId: def.id, value },
    });
  }

  revalidatePath(`/hr/employees/${userId}`);
  redirect(`/hr/employees/${userId}`);
}

export async function toggleEmployeeActive(fd: FormData) {
  await requireAnyRole(["HR", "ADMIN"]);
  const userId = fd.get("userId") as string;
  const emp = await prisma.employee.findUnique({ where: { userId } });
  if (!emp) return;
  const newActive = !emp.isActive;
  // Deactivating an employee also revokes login (User.isActive) — previously
  // this only flipped the HR-facing flag, leaving a "deactivated" employee
  // still able to log in with their old credentials.
  await prisma.$transaction([
    prisma.employee.update({ where: { userId }, data: { isActive: newActive } }),
    prisma.user.update({ where: { id: userId }, data: { isActive: newActive } }),
  ]);
  revalidatePath(`/hr/employees/${userId}`);
}

export async function resetEmployeePassword(fd: FormData) {
  await requireAnyRole(["HR", "ADMIN"]);
  const userId = fd.get("userId") as string;
  const password = ((fd.get("password") as string) ?? "").trim();
  if (!password) return;
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: hashPassword(password) } });
  redirect(`/hr/employees/${userId}`);
}

export async function toggleEmployeeSystem(fd: FormData) {
  await requireAnyRole(["HR", "ADMIN"]);
  const userId = fd.get("userId") as string;
  const emp = await prisma.employee.findUnique({ where: { userId } });
  if (!emp) return;
  await prisma.employee.update({ where: { userId }, data: { isSystem: !emp.isSystem } });
  revalidatePath(`/hr/employees/${userId}`);
  revalidatePath("/hr/employees");
}

export async function deleteEmployee(fd: FormData) {
  await requireAnyRole(["HR", "ADMIN"]);
  const userId = fd.get("userId") as string;

  await prisma.$transaction([
    prisma.employeeFieldValue.deleteMany({ where: { employeeId: userId } }),
    prisma.employeeDocument.deleteMany({ where: { employeeId: userId } }),
    prisma.leaveRequest.deleteMany({ where: { employeeId: userId } }),
    prisma.employeeFine.deleteMany({ where: { employeeId: userId } }),
    prisma.adHocBonus.deleteMany({ where: { employeeId: userId } }),
    prisma.payrollItem.deleteMany({ where: { employeeId: userId } }),
    prisma.salaryAdvance.deleteMany({ where: { employeeId: userId } }), // cascades instalments
    prisma.attendance.deleteMany({ where: { employeeId: userId } }),    // cascades breaks
    prisma.employee.delete({ where: { userId } }),
    prisma.user.update({ where: { id: userId }, data: { isActive: false } }),
  ]);

  redirect("/hr/employees");
}

export async function uploadDocument(fd: FormData) {
  const session = await requireAnyRole(["HR", "ADMIN"]);
  const employeeId = fd.get("employeeId") as string;
  const name = (fd.get("name") as string).trim();
  const file = fd.get("file") as File | null;
  if (!file || file.size === 0) return;

  const uploadsDir = path.join(process.cwd(), "uploads", "employees", employeeId);
  await mkdir(uploadsDir, { recursive: true });
  const ext = file.name.split(".").pop() ?? "bin";
  const filename = `${Date.now()}.${ext}`;
  const filePath = path.join(uploadsDir, filename);
  await writeFile(filePath, Buffer.from(await file.arrayBuffer()));

  const relPath = `/uploads/employees/${employeeId}/${filename}`;
  await prisma.employeeDocument.create({
    data: { employeeId, name: name || file.name, filePath: relPath, uploadedById: session.id },
  });
  revalidatePath(`/hr/employees/${employeeId}/documents`);
}

export async function deleteDocument(fd: FormData) {
  await requireAnyRole(["HR", "ADMIN"]);
  const id = fd.get("id") as string;
  await prisma.employeeDocument.delete({ where: { id } });
  revalidatePath("/hr/employees");
}

// ---- System accounts ----

export async function createSystemAccount(fd: FormData) {
  await requireAnyRole(["HR", "ADMIN"]);
  const name = (fd.get("name") as string ?? "").trim();
  const username = (fd.get("username") as string ?? "").trim().toLowerCase();
  const password = (fd.get("password") as string ?? "").trim();
  const roles = (fd.getAll("roles") as string[]) as Role[];
  if (!name || !username || !password) redirect("/hr/employees?tab=system&error=missing");
  try {
    await prisma.$transaction(async (tx) => {
      await reclaimUsernameIfInactive(tx, username);
      await tx.user.create({
        data: { name, username, passwordHash: hashPassword(password), roles, isSystemAccount: true },
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "USERNAME_TAKEN") redirect("/hr/employees?tab=system&error=exists");
    throw err;
  }
  revalidatePath("/hr/employees");
  redirect("/hr/employees?tab=system");
}

export async function toggleSystemAccountActive(fd: FormData) {
  await requireAnyRole(["HR", "ADMIN"]);
  const id = fd.get("id") as string;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || !user.isSystemAccount) return;
  await prisma.user.update({ where: { id }, data: { isActive: !user.isActive } });
  revalidatePath("/hr/employees");
}

export async function resetSystemAccountPassword(fd: FormData) {
  await requireAnyRole(["HR", "ADMIN"]);
  const id = fd.get("id") as string;
  const password = (fd.get("password") as string ?? "").trim();
  if (!password) return;
  await prisma.user.update({ where: { id }, data: { passwordHash: hashPassword(password) } });
  revalidatePath("/hr/employees");
}
