import bcrypt from "bcryptjs";
import {
  PrismaClient,
  Prisma,
  Role,
  MenuItemCode,
  MenuUnit,
  SoupApplies,
  AttendanceStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

const hash = (s: string) => bcrypt.hashSync(s, 10);

async function main() {
  // ---- Users (login is tied to HR later; these are seed accounts) ----
  const users: Array<{
    username: string;
    name: string;
    password: string;
    roles: Role[];
    pin?: string;
  }> = [
    { username: "admin", name: "Administrator", password: "admin123", roles: [Role.ADMIN, Role.MANAGER], pin: "1234" },
    { username: "owner", name: "Owner (all roles)", password: "owner123", roles: [Role.ADMIN, Role.MANAGER, Role.CASHIER, Role.WAITER, Role.KITCHEN], pin: "1234" },
    { username: "manager", name: "Floor Manager", password: "manager123", roles: [Role.MANAGER], pin: "1234" },
    { username: "waiter", name: "Waiter One", password: "waiter123", roles: [Role.WAITER] },
    { username: "waiter2", name: "Waiter Two", password: "waiter123", roles: [Role.WAITER] },
    { username: "kitchen", name: "Kitchen Station", password: "kitchen123", roles: [Role.KITCHEN] },
    { username: "cashier", name: "Cashier One", password: "cashier123", roles: [Role.CASHIER] },
    { username: "hr", name: "HR Officer", password: "hr123", roles: [Role.HR] },
  ];
  for (const u of users) {
    await prisma.user.upsert({
      where: { username: u.username },
      update: { name: u.name, roles: u.roles, isActive: true, ...(u.pin ? { pinHash: hash(u.pin) } : {}) },
      create: {
        username: u.username,
        name: u.name,
        passwordHash: hash(u.password),
        roles: u.roles,
        pinHash: u.pin ? hash(u.pin) : null,
      },
    });
  }

  // ---- Menu items (MMK; admin-editable, prices preserved on re-seed) ----
  const menu = [
    { code: MenuItemCode.ADULT, name: "Adult Buffet", unit: MenuUnit.UNIT, price: 25000 },
    { code: MenuItemCode.CHILD, name: "Child Buffet", unit: MenuUnit.UNIT, price: 15000 },
    { code: MenuItemCode.BEER, name: "Beer", unit: MenuUnit.UNIT, price: 3000 },
    { code: MenuItemCode.POT_ADDON, name: "Extra Pot (Add-on)", unit: MenuUnit.UNIT, price: 5000 },
    { code: MenuItemCode.WASTAGE, name: "Wastage", unit: MenuUnit.GRAM, price: 50 },
  ];
  for (const m of menu) {
    await prisma.menuItem.upsert({
      where: { code: m.code },
      update: { name: m.name, unit: m.unit }, // keep admin-set price
      create: m,
    });
  }

  // ---- Settings (defaults; admin changes preserved on re-seed) ----
  const settings: Record<string, Prisma.InputJsonValue> = {
    restaurantName: "QQ Hotpot BBQ",
    currency: "MMK",
    freePotRatio: 4,
    freePotRounding: "UP", // ceil(diners / ratio)
    reservationBlockMins: 90,
    taxEnabled: false,
    taxRatePct: 0,
    serviceEnabled: false,
    serviceRatePct: 0,
  };
  for (const [key, valueJson] of Object.entries(settings)) {
    await prisma.setting.upsert({
      where: { key },
      update: {}, // do not clobber admin-edited settings
      create: { key, valueJson },
    });
  }

  // ---- Soup flavours ----
  const flavours = [
    { name: "Spicy Mala", appliesTo: SoupApplies.BOTH, sortOrder: 1 },
    { name: "Tomato", appliesTo: SoupApplies.HOTPOT, sortOrder: 2 },
    { name: "Clear Chicken", appliesTo: SoupApplies.HOTPOT, sortOrder: 3 },
    { name: "Mushroom", appliesTo: SoupApplies.HOTPOT, sortOrder: 4 },
    { name: "Tom Yum", appliesTo: SoupApplies.HOTPOT, sortOrder: 5 },
    { name: "Herbal", appliesTo: SoupApplies.HOTPOT, sortOrder: 6 },
    { name: "BBQ Original", appliesTo: SoupApplies.BBQ, sortOrder: 7 },
    { name: "BBQ Spicy", appliesTo: SoupApplies.BBQ, sortOrder: 8 },
  ];
  for (const f of flavours) {
    await prisma.soupFlavour.upsert({
      where: { name: f.name },
      update: { appliesTo: f.appliesTo, sortOrder: f.sortOrder },
      create: f,
    });
  }

  // ---- Areas + tables (A1..A8, B1..B6) ----
  const areas = [
    { name: "A", sortOrder: 1, count: 8 },
    { name: "B", sortOrder: 2, count: 6 },
  ];
  for (const a of areas) {
    const area = await prisma.area.upsert({
      where: { name: a.name },
      update: { sortOrder: a.sortOrder },
      create: { name: a.name, sortOrder: a.sortOrder },
    });
    for (let n = 1; n <= a.count; n++) {
      const label = `${a.name}${n}`;
      await prisma.table.upsert({
        where: { label },
        update: {},
        create: { areaId: area.id, number: n, label, capacity: 4 },
      });
    }
  }

  // ---- Expense categories ----
  const cats = [
    "Market / Groceries",
    "Utilities",
    "Gas / Fuel",
    "Wages / Salary",
    "Maintenance",
    "Supplies",
    "Misc",
  ];
  for (const name of cats) {
    await prisma.expenseCategory.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  // ---- Demo Employee profiles (linked to seeded Users) ----
  const waiterUser = await prisma.user.findUnique({ where: { username: "waiter" } });
  const cashierUser = await prisma.user.findUnique({ where: { username: "cashier" } });
  const kitchenUser = await prisma.user.findUnique({ where: { username: "kitchen" } });

  const demoEmployees = [
    {
      userId: waiterUser!.id,
      employeeNo: "EMP001",
      startDate: new Date("2024-01-15"),
      basicSalary: 350000,
      attendanceBonus: 50000,
      restDays: [0], // Sunday
      phone: "09-111-222-333",
    },
    {
      userId: cashierUser!.id,
      employeeNo: "EMP002",
      startDate: new Date("2024-02-01"),
      basicSalary: 400000,
      attendanceBonus: 50000,
      restDays: [0], // Sunday
      phone: "09-444-555-666",
    },
    {
      userId: kitchenUser!.id,
      employeeNo: "EMP003",
      startDate: new Date("2024-01-01"),
      basicSalary: 380000,
      attendanceBonus: 50000,
      restDays: [0, 1], // Sunday + Monday
      phone: "09-777-888-999",
    },
  ];

  for (const emp of demoEmployees) {
    await prisma.employee.upsert({
      where: { userId: emp.userId },
      update: {},
      create: emp,
    });
  }

  // ---- Demo Employee Field Definitions ----
  const fieldDefs = [
    { label: "NRC Number", fieldType: "TEXT" as const, sortOrder: 1 },
    { label: "Bank Account", fieldType: "TEXT" as const, sortOrder: 2 },
    { label: "Emergency Contact Name", fieldType: "TEXT" as const, sortOrder: 3 },
    { label: "Emergency Contact Phone", fieldType: "TEXT" as const, sortOrder: 4 },
  ];
  for (const f of fieldDefs) {
    const existing = await prisma.employeeFieldDef.findFirst({ where: { label: f.label } });
    if (!existing) {
      await prisma.employeeFieldDef.create({ data: f });
    }
  }

  // eslint-disable-next-line no-console
  console.log("✓ Seed complete. Default logins (username / password):");
  // eslint-disable-next-line no-console
  console.log(users.map((u) => `   - ${u.username} / ${u.password}  [${u.roles.join(", ")}]`).join("\n"));
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
