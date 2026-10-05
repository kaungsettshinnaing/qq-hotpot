import { describe, expect, it } from "vitest";
import { parseInputDate } from "./format";

describe("parseInputDate", () => {
  it("parses the native date input format as UTC midnight", () => {
    expect(parseInputDate("2026-10-05")?.toISOString()).toBe("2026-10-05T00:00:00.000Z");
  });

  it("parses DD-Mon-YYYY, case-insensitively", () => {
    expect(parseInputDate("05-Oct-2026")?.toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(parseInputDate("05-oct-2026")?.toISOString()).toBe("2026-10-05T00:00:00.000Z");
  });

  it("treats a two-digit year as 20xx, not 19xx", () => {
    expect(parseInputDate("5-Oct-26")?.getUTCFullYear()).toBe(2026);
  });

  it("returns null — never an Invalid Date object — for unparseable input", () => {
    // "O5" (letter O) used to produce an Invalid Date that Prisma then threw on.
    expect(parseInputDate("O5-Oct-2026")).toBeNull();
    expect(parseInputDate("05/10/2026")).toBeNull();
    expect(parseInputDate("")).toBeNull();
    expect(parseInputDate(null)).toBeNull();
    expect(parseInputDate("2026-13-45")).toBeNull();
  });
});
