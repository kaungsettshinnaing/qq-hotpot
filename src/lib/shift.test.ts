import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// createCashMovement — the Cash in / Cash out buttons must be idempotent per
// form submission. One tap = one ledger row, even if the request is sent twice.
// ---------------------------------------------------------------------------

const rows = new Map<string, { id: string; requestId: string | null; amount: number; type: string }>();
let seq = 0;
const create = vi.fn();
const findUnique = vi.fn();
const findFirst = vi.fn();
const postCashMovement = vi.fn();

vi.mock("./db", () => ({
  prisma: {
    cashCollection: {
      findUnique: (args: { where: { requestId: string } }) => findUnique(args),
      create: (args: { data: { requestId: string | null; amount: number; type: string } }) => create(args),
    },
    cashierShift: { findFirst: (args: unknown) => findFirst(args) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ cashCollection: { create: (args: { data: { requestId: string | null; amount: number; type: string } }) => create(args) } }),
  },
}));
vi.mock("./journal-postings", () => ({ postCashMovement: (...a: unknown[]) => postCashMovement(...a) }));

import { cleanRequestId, createCashMovement } from "./shift";

function p2002() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
  });
}

beforeEach(() => {
  rows.clear();
  seq = 0;
  create.mockReset();
  findUnique.mockReset();
  findFirst.mockReset();
  postCashMovement.mockReset();
  findFirst.mockResolvedValue(null); // no shift open
  findUnique.mockImplementation(async ({ where }: { where: { requestId: string } }) => rows.get(where.requestId) ?? null);
  create.mockImplementation(async ({ data }: { data: { requestId: string | null; amount: number; type: string } }) => {
    if (data.requestId && rows.has(data.requestId)) throw p2002();
    const row = { id: `row-${++seq}`, ...data };
    if (data.requestId) rows.set(data.requestId, row);
    return row;
  });
});

describe("createCashMovement", () => {
  it("creates one row and posts one journal entry for a fresh request id", async () => {
    const m = await createCashMovement("INJECT", 50_000, null, "u1", "req-aaaaaaaa");
    expect(m.id).toBe("row-1");
    expect(create).toHaveBeenCalledTimes(1);
    expect(postCashMovement).toHaveBeenCalledTimes(1);
  });

  it("returns the SAME row when the same submission is sent twice (double tap)", async () => {
    const first = await createCashMovement("COLLECT", 20_000, "bank run", "u1", "req-bbbbbbbb");
    const second = await createCashMovement("COLLECT", 20_000, "bank run", "u1", "req-bbbbbbbb");
    expect(second.id).toBe(first.id);
    expect(create).toHaveBeenCalledTimes(1);
    expect(postCashMovement).toHaveBeenCalledTimes(1);
  });

  it("survives the race where both requests pass the pre-check and the second insert hits the unique index", async () => {
    // First request: pre-check says "nothing yet"; insert succeeds.
    // Second request: pre-check ALSO said "nothing yet" (it ran before the first
    // commit), so it goes on to insert and the unique index rejects it with P2002.
    findUnique
      .mockResolvedValueOnce(null) // first request pre-check
      .mockResolvedValueOnce(null); // second request pre-check (stale read)
    const first = await createCashMovement("INJECT", 10_000, null, "u1", "req-cccccccc");
    const second = await createCashMovement("INJECT", 10_000, null, "u1", "req-cccccccc");
    expect(second.id).toBe(first.id);
    expect(create).toHaveBeenCalledTimes(2); // the second insert was attempted and rejected
    expect(postCashMovement).toHaveBeenCalledTimes(1); // but only one journal entry was posted
  });

  it("still records a movement with no request id (legacy / scripted callers)", async () => {
    const a = await createCashMovement("INJECT", 1_000, null, "u1");
    const b = await createCashMovement("INJECT", 1_000, null, "u1");
    expect(a.id).not.toBe(b.id);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("re-throws a unique violation that is not about the request id", async () => {
    create.mockRejectedValueOnce(p2002());
    await expect(createCashMovement("INJECT", 1_000, null, "u1", null)).rejects.toThrow("Unique constraint failed");
  });
});

describe("cleanRequestId", () => {
  it("accepts a UUID and a short random token", () => {
    expect(cleanRequestId("8b2a3c1e-6d7f-4a9b-8c0d-1e2f3a4b5c6d")).toBe("8b2a3c1e-6d7f-4a9b-8c0d-1e2f3a4b5c6d");
    expect(cleanRequestId("  lx8n2k1-abcdef12  ")).toBe("lx8n2k1-abcdef12");
  });

  it("drops empty, too-short, too-long or odd-character values", () => {
    expect(cleanRequestId("")).toBeNull();
    expect(cleanRequestId(null)).toBeNull();
    expect(cleanRequestId("abc")).toBeNull();
    expect(cleanRequestId("x".repeat(65))).toBeNull();
    expect(cleanRequestId("has space inside")).toBeNull();
    expect(cleanRequestId("drop'table")).toBeNull();
  });
});
