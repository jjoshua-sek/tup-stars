import { manilaWallClock } from "@/lib/utils/time";

/**
 * Shapes the Reports page's figures for its charts. Counts only, as the rest
 * of the page: nothing here carries a name.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export interface MonthBucket {
  /** "2026-11", by the Manila calendar. */
  key: string;
  /** "Nov" under its column. */
  label: string;
  /** "November 2026" in the tooltip and the table. */
  fullLabel: string;
  total: number;
  minor: number;
  major: number;
  confidential: number;
}

function keyOf(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

/** The Manila calendar month an instant falls in: a case filed 11 PM on 30 Nov UTC is December in Manila. */
export function manilaMonthKey(at: string | Date): string {
  const { year, month } = manilaWallClock(new Date(at));
  return keyOf(year, month);
}

/**
 * Cases filed in each of the last `months` Manila months, oldest first, this
 * month included. A month with no cases is still a column, at zero, so a
 * quiet month reads as quiet and not as missing.
 */
export function casesByMonth(
  cases: ReadonlyArray<{ classification: string; created_at: string }>,
  now: Date,
  months = 6,
): MonthBucket[] {
  const { year, month } = manilaWallClock(now);
  const buckets: MonthBucket[] = [];
  for (let back = months - 1; back >= 0; back -= 1) {
    const at = new Date(Date.UTC(year, month - back, 1));
    const y = at.getUTCFullYear();
    const m = at.getUTCMonth();
    buckets.push({
      key: keyOf(y, m),
      label: MONTHS[m],
      fullLabel: `${MONTHS_LONG[m]} ${y}`,
      total: 0,
      minor: 0,
      major: 0,
      confidential: 0,
    });
  }
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  for (const row of cases) {
    const bucket = byKey.get(manilaMonthKey(row.created_at));
    if (!bucket) continue;
    bucket.total += 1;
    if (row.classification === "minor") bucket.minor += 1;
    else if (row.classification === "major") bucket.major += 1;
    else if (row.classification === "confidential") bucket.confidential += 1;
  }
  return buckets;
}

export interface BarDatum {
  label: string;
  value: number;
}

/** Counts rows by a label, largest first; ties go alphabetically so the order is stable. */
export function countBy<T>(rows: ReadonlyArray<T>, labelOf: (row: T) => string): BarDatum[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const label = labelOf(row);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

/** A whole-number share, "0%" for an empty total rather than NaN. */
export function percentOf(value: number, total: number): string {
  return total > 0 ? `${Math.round((value / total) * 100)}%` : "0%";
}
