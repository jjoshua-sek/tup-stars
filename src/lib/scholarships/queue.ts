import { APPLICATION_OPEN, APPLICATION_STATUS_LABELS } from "@/types/osa";

/**
 * The staff Scholarships queue: which applications to list, in what order.
 *
 * The page reads these from the address bar (?view=&number=&order=), so a
 * filtered list can be bookmarked or sent to another officer, and the back
 * button works. Anything unrecognised falls back to the default view:
 * applications still waiting on the OSA, oldest first, first come first served.
 */

export const WAITING = "waiting";
export const ALL = "all";

export type QueueView = typeof WAITING | typeof ALL | keyof typeof APPLICATION_STATUS_LABELS;
export type QueueOrder = "oldest" | "newest";

export interface QueueFilters {
  view: QueueView;
  /** Part of a student number, upper-cased; "" when not searching. */
  number: string;
  order: QueueOrder;
}

/** The choices of the View dropdown, in the order an application moves. */
export const VIEW_OPTIONS: Array<{ value: QueueView; label: string }> = [
  { value: WAITING, label: "Waiting for the OSA" },
  ...Object.entries(APPLICATION_STATUS_LABELS).map(([value, label]) => ({ value: value as QueueView, label })),
  { value: ALL, label: "All applications" },
];

export function parseQueueFilters(params: { view?: string; number?: string; order?: string }): QueueFilters {
  const view = VIEW_OPTIONS.some((option) => option.value === params.view) ? (params.view as QueueView) : WAITING;
  // Student numbers are letters, digits and dashes (TUPM-24-0123). Keeping only
  // those also keeps % and _ out of the ILIKE pattern the page builds.
  const number = (params.number ?? "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20);
  const order: QueueOrder = params.order === "newest" ? "newest" : "oldest";
  return { view, number, order };
}

/** The statuses a view lists; null means every status. */
export function statusesFor(view: QueueView): string[] | null {
  if (view === ALL) return null;
  if (view === WAITING) return [...APPLICATION_OPEN];
  return [view];
}

export function isOpenStatus(status: string): boolean {
  return APPLICATION_OPEN.includes(status);
}

/**
 * Each open application's place in line for its own scholarship: 1 for the
 * first student to apply. Slots are per program, so the line is too. Ties on
 * the same instant (rare) go by id so the order never shuffles between loads.
 */
export function queuePositions(
  rows: Array<{ id: string; scholarship_id: string; created_at: string }>,
): Map<string, number> {
  const sorted = [...rows].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
  const next = new Map<string, number>();
  const positions = new Map<string, number>();
  for (const row of sorted) {
    const place = (next.get(row.scholarship_id) ?? 0) + 1;
    next.set(row.scholarship_id, place);
    positions.set(row.id, place);
  }
  return positions;
}

/** 1 → "1st", 2 → "2nd", 11 → "11th", 23 → "23rd". */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}
