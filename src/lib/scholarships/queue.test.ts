import { describe, expect, it } from "vitest";

import { ordinal, parseQueueFilters, queuePositions, statusesFor } from "./queue";

describe("parseQueueFilters", () => {
  it("defaults to the waiting list, oldest first", () => {
    expect(parseQueueFilters({})).toEqual({ view: "waiting", number: "", order: "oldest" });
  });

  it("accepts a status, all, and newest first", () => {
    expect(parseQueueFilters({ view: "awarded", order: "newest" })).toMatchObject({ view: "awarded", order: "newest" });
    expect(parseQueueFilters({ view: "all" }).view).toBe("all");
  });

  it("falls back on anything it does not know", () => {
    expect(parseQueueFilters({ view: "drop table", order: "sideways" })).toMatchObject({ view: "waiting", order: "oldest" });
  });

  it("keeps a student number to letters, digits and dashes", () => {
    expect(parseQueueFilters({ number: " tupm-24-%_0123 " }).number).toBe("TUPM-24-0123");
    expect(parseQueueFilters({ number: "x".repeat(50) }).number).toHaveLength(20);
  });
});

describe("statusesFor", () => {
  it("lists the open statuses for the waiting view and nothing for all", () => {
    expect(statusesFor("waiting")).toEqual(["interest_declared", "documents_pending", "documents_complete", "under_review"]);
    expect(statusesFor("all")).toBeNull();
    expect(statusesFor("awarded")).toEqual(["awarded"]);
  });
});

describe("queuePositions", () => {
  it("numbers each scholarship's line separately, first to apply first", () => {
    const positions = queuePositions([
      { id: "c", scholarship_id: "ched", created_at: "2026-11-03T02:00:00Z" },
      { id: "a", scholarship_id: "ched", created_at: "2026-11-01T02:00:00Z" },
      { id: "b", scholarship_id: "dost", created_at: "2026-11-02T02:00:00Z" },
      { id: "d", scholarship_id: "ched", created_at: "2026-11-02T02:00:00Z" },
    ]);
    expect(Object.fromEntries(positions)).toEqual({ a: 1, d: 2, c: 3, b: 1 });
  });

  it("breaks a tie on the same instant by id, so the order is stable", () => {
    const at = "2026-11-01T02:00:00Z";
    const positions = queuePositions([
      { id: "y", scholarship_id: "s", created_at: at },
      { id: "x", scholarship_id: "s", created_at: at },
    ]);
    expect(positions.get("x")).toBe(1);
    expect(positions.get("y")).toBe(2);
  });
});

describe("ordinal", () => {
  it("handles the teens", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th",
    ]);
  });
});
