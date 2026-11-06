import { describe, expect, it } from "vitest";

import { TERM_KEYS, readActiveTerm, recentTerms, schoolYearStart, termSchema } from "./term";

// November 6, 2026, Manila: the calendar says 1st Semester, AY 2026–2027.
const now = new Date("2026-11-06T04:00:00Z");

describe("readActiveTerm", () => {
  it("uses the term the administrator set", () => {
    const { term, setByAdmin } = readActiveTerm(
      [
        { key: TERM_KEYS.semester, value: "2nd Semester" },
        { key: TERM_KEYS.schoolYear, value: "2025-2026" },
      ],
      now,
    );
    expect(setByAdmin).toBe(true);
    expect(term).toEqual({
      semester: "2nd Semester",
      schoolYear: "2025-2026",
      schoolYearLabel: "AY 2025–2026",
      label: "2nd Semester, AY 2025–2026",
    });
  });

  it("falls back to the calendar when nothing (or something invalid) is set", () => {
    for (const rows of [
      null,
      [],
      [{ key: TERM_KEYS.semester, value: null }, { key: TERM_KEYS.schoolYear, value: null }],
      [{ key: TERM_KEYS.semester, value: "Third" }, { key: TERM_KEYS.schoolYear, value: "2026-2027" }],
      [{ key: TERM_KEYS.semester, value: "1st Semester" }, { key: TERM_KEYS.schoolYear, value: "2026-2028" }],
    ]) {
      const { term, setByAdmin } = readActiveTerm(rows, now);
      expect(setByAdmin).toBe(false);
      expect(term.label).toBe("1st Semester, AY 2026–2027");
    }
  });
});

describe("school year and the form", () => {
  it("accepts only consecutive years", () => {
    expect(schoolYearStart("2026-2027")).toBe(2026);
    expect(schoolYearStart("2026-2028")).toBeNull();
    expect(schoolYearStart("26-27")).toBeNull();
    expect(termSchema.safeParse({ semester: "Summer", schoolYear: " 2025-2026 " }).success).toBe(true);
    expect(termSchema.safeParse({ semester: "Summer", schoolYear: "2025" }).success).toBe(false);
  });

  it("lists this term and the two before it, across a school year", () => {
    const labels = (semester: string, year: string) =>
      recentTerms(readActiveTerm([
        { key: TERM_KEYS.semester, value: semester },
        { key: TERM_KEYS.schoolYear, value: year },
      ]).term).map((t) => t.label);
    expect(labels("1st Semester", "2026-2027")).toEqual([
      "1st Semester, AY 2026–2027",
      "Summer, AY 2025–2026",
      "2nd Semester, AY 2025–2026",
    ]);
    expect(labels("Summer", "2025-2026")).toEqual([
      "Summer, AY 2025–2026",
      "2nd Semester, AY 2025–2026",
      "1st Semester, AY 2025–2026",
    ]);
  });
});
