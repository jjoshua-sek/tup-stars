import { describe, expect, it } from "vitest";

import { casesByMonth, countBy, manilaMonthKey, percentOf } from "./report-charts";

describe("manilaMonthKey", () => {
  it("uses the Manila calendar, eight hours ahead of UTC", () => {
    expect(manilaMonthKey("2026-11-30T15:59:00Z")).toBe("2026-11");
    expect(manilaMonthKey("2026-11-30T16:00:00Z")).toBe("2026-12");
  });
});

describe("casesByMonth", () => {
  const now = new Date("2026-11-15T04:00:00Z");

  it("gives six months, oldest first, across a year boundary when needed", () => {
    expect(casesByMonth([], now).map((b) => b.key)).toEqual([
      "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11",
    ]);
    const january = casesByMonth([], new Date("2027-01-10T04:00:00Z"), 3);
    expect(january.map((b) => b.fullLabel)).toEqual(["November 2026", "December 2026", "January 2027"]);
  });

  it("counts each case in its month and by classification, and skips older ones", () => {
    const buckets = casesByMonth(
      [
        { classification: "minor", created_at: "2026-11-02T01:00:00Z" },
        { classification: "major", created_at: "2026-11-03T01:00:00Z" },
        { classification: "confidential", created_at: "2026-10-31T17:00:00Z" }, // Nov 1 in Manila
        { classification: "minor", created_at: "2026-09-10T01:00:00Z" },
        { classification: "minor", created_at: "2026-01-10T01:00:00Z" }, // before the window
      ],
      now,
    );
    const nov = buckets.at(-1)!;
    expect(nov).toMatchObject({ label: "Nov", total: 3, minor: 1, major: 1, confidential: 1 });
    expect(buckets.find((b) => b.key === "2026-09")!.total).toBe(1);
    expect(buckets.reduce((sum, b) => sum + b.total, 0)).toBe(4);
  });
});

describe("countBy", () => {
  it("sorts largest first, ties alphabetically", () => {
    expect(countBy(["b", "a", "c", "c", "a"], (x) => x)).toEqual([
      { label: "a", value: 2 },
      { label: "c", value: 2 },
      { label: "b", value: 1 },
    ]);
  });
});

describe("percentOf", () => {
  it("rounds, and survives an empty total", () => {
    expect(percentOf(1, 3)).toBe("33%");
    expect(percentOf(0, 0)).toBe("0%");
  });
});
