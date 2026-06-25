import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient across hot-reloads / module instances.
const g = globalThis as unknown as { __qq_prisma?: PrismaClient };

export const prisma =
  g.__qq_prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  g.__qq_prisma = prisma;
}
