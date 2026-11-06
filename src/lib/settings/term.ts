import { z } from "zod";

import { SEMESTERS, getCurrentTerm, termOf, type AcademicTerm, type Semester } from "@/lib/access/term";

/**
 * The term the administrator set in Settings (migration 00057), which every
 * page, form and check uses: ID validation, the gate, the academic records
 * forms, the document checks, reports and the header. Until it is set, the
 * term the Manila calendar suggests is used instead (getCurrentTerm).
 */
export const TERM_KEYS = {
  semester: "term_semester",
  schoolYear: "term_school_year",
} as const;

const SCHOOL_YEAR = /^(\d{4})-(\d{4})$/;

/** "2026-2027" → 2026, when the second year follows the first; otherwise null. */
export function schoolYearStart(value: unknown): number | null {
  const match = typeof value === "string" ? value.match(SCHOOL_YEAR) : null;
  if (!match) return null;
  const start = Number(match[1]);
  return Number(match[2]) === start + 1 ? start : null;
}

/** Rows from system_settings → the term in force, and whether the administrator set it. */
export function readActiveTerm(
  rows: ReadonlyArray<{ key: string; value: unknown }> | null | undefined,
  now: Date = new Date(),
): { term: AcademicTerm; setByAdmin: boolean } {
  const value = (key: string) => rows?.find((row) => row.key === key)?.value;
  const semester = value(TERM_KEYS.semester);
  const start = schoolYearStart(value(TERM_KEYS.schoolYear));
  if ((SEMESTERS as readonly unknown[]).includes(semester) && start !== null) {
    return { term: termOf(semester as Semester, start), setByAdmin: true };
  }
  return { term: getCurrentTerm(now), setByAdmin: false };
}

export const termSchema = z.object({
  semester: z.enum(SEMESTERS, { message: "Choose the semester." }),
  schoolYear: z
    .string()
    .trim()
    .refine((value) => schoolYearStart(value) !== null, "Type the school year as 2026-2027."),
});

/** The terms a document may be filed under: this one and the two before it. */
export function recentTerms(term: AcademicTerm): AcademicTerm[] {
  const start = schoolYearStart(term.schoolYear)!;
  const order: Array<[Semester, number]> = [];
  // Walk back: Summer → 2nd → 1st → previous year's Summer ...
  let semester = term.semester;
  let year = start;
  for (let i = 0; i < 3; i++) {
    order.push([semester, year]);
    if (semester === "Summer") semester = "2nd Semester";
    else if (semester === "2nd Semester") semester = "1st Semester";
    else {
      semester = "Summer";
      year -= 1;
    }
  }
  return order.map(([s, y]) => termOf(s, y));
}
