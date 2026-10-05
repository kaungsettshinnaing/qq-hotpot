import { Prisma } from "@prisma/client";

/** True for a Prisma "known request" error with the given code
 *  (P2002 unique violation, P2025 record not found, P2003 FK violation). */
export function isPrismaError(e: unknown, code: string): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === code;
}
