import { beforeEach, describe, expect, it, vi } from "vitest";

// openTable must refuse a table opened without a buffet choice, and setBuffetType
// only changes an OPEN table.

class Redirect extends Error { constructor(public to: string) { super(to); } }

const sessionCreate = vi.fn();
const sessionUpdateMany = vi.fn();
const special = { row: { price: 29000, isActive: true } as { price: number; isActive: boolean } | null };

vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Redirect(to); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth", () => ({ requireAnyRole: async () => ({ id: "u1" }) }));
vi.mock("@/lib/realtime", () => ({ emitFloor: () => {}, emitKitchen: () => {} }));
vi.mock("@/lib/lang", () => ({ getT: async () => (k: string) => k }));
vi.mock("@/lib/settings", () => ({ getSettings: async () => ({}) }));
vi.mock("@/lib/db", () => ({
  prisma: {
    table: { findUnique: async () => ({ isActive: true }) },
    tableMerge: { findFirst: async () => null },
    menuItem: { findUnique: async () => special.row },
    tableSession: {
      findFirst: async () => null,
      findUnique: async () => ({ tableId: "t1" }),
      create: (a: unknown) => sessionCreate(a),
      updateMany: (a: unknown) => sessionUpdateMany(a),
    },
  },
}));

import { openTable, setBuffetType } from "./actions";

function form(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

async function redirectOf(p: Promise<unknown>): Promise<string> {
  try { await p; } catch (e) { if (e instanceof Redirect) return e.to; throw e; }
  throw new Error("expected a redirect");
}

beforeEach(() => {
  sessionCreate.mockReset().mockResolvedValue({ id: "s1" });
  sessionUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  special.row = { price: 29000, isActive: true };
});

describe("openTable buffet choice", () => {
  it("refuses a table opened without choosing Normal or Special", async () => {
    expect(await redirectOf(openTable("t1", form({ adults: "2", children: "0" }))))
      .toBe("/waiter/open/t1?error=buffet-required");
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it("refuses a made-up buffet type", async () => {
    expect(await redirectOf(openTable("t1", form({ adults: "2", buffetType: "VIP" }))))
      .toBe("/waiter/open/t1?error=buffet-required");
  });

  it("opens a Special table with the type stored", async () => {
    expect(await redirectOf(openTable("t1", form({ adults: "3", children: "1", buffetType: "SPECIAL" }))))
      .toBe("/waiter/session/s1");
    expect(sessionCreate.mock.calls[0][0].data).toMatchObject({ adults: 3, children: 1, buffetType: "SPECIAL" });
  });

  it("opens a Normal table", async () => {
    await redirectOf(openTable("t1", form({ adults: "2", buffetType: "NORMAL" })));
    expect(sessionCreate.mock.calls[0][0].data.buffetType).toBe("NORMAL");
  });

  it("refuses Special while its price is hidden or unset", async () => {
    special.row = { price: 29000, isActive: false };
    expect(await redirectOf(openTable("t1", form({ adults: "2", buffetType: "SPECIAL" }))))
      .toBe("/waiter/open/t1?error=special-not-set");
    special.row = null;
    expect(await redirectOf(openTable("t1", form({ adults: "2", buffetType: "SPECIAL" }))))
      .toBe("/waiter/open/t1?error=special-not-set");
    expect(sessionCreate).not.toHaveBeenCalled();
  });
});

describe("setBuffetType", () => {
  it("switches an open table, guarded on OPEN", async () => {
    expect(await setBuffetType("s1", "SPECIAL")).toEqual({ ok: true });
    expect(sessionUpdateMany).toHaveBeenCalledWith({
      where: { id: "s1", status: "OPEN" }, data: { buffetType: "SPECIAL" },
    });
  });

  it("refuses a settled or cancelled table", async () => {
    sessionUpdateMany.mockResolvedValue({ count: 0 });
    expect(await setBuffetType("s1", "NORMAL")).toEqual({ ok: false, error: "error_session_not_open" });
  });

  it("refuses Special when it isn't offered, and junk types", async () => {
    special.row = { price: 0, isActive: true };
    expect(await setBuffetType("s1", "SPECIAL")).toEqual({ ok: false, error: "error_code_special_not_set" });
    expect(await setBuffetType("s1", "x")).toEqual({ ok: false, error: "error_code_buffet_required" });
    expect(sessionUpdateMany).not.toHaveBeenCalled();
  });
});
